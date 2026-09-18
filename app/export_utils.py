"""
Shared Excel/PDF report export helpers.

Arabic PDF text needs two extra steps beyond a normal reportlab draw call:
reshaping (Arabic letters change shape depending on position in a word) and
bidi reordering (so right-to-left text doesn't come out reversed). Skipping
either produces disconnected or backwards glyphs, not just "wrong font."

The Arabic-capable font itself is NOT bundled in this repo — Tahoma/Arial are
Microsoft-licensed fonts that ship with Windows, and copying them into a
codebase that gets redistributed to multiple client companies would raise a
real redistribution licensing problem. Instead this looks for a font already
present on the deployment machine (Windows ships several that render Arabic
correctly), or a path a deployer configures explicitly.
"""

import io
import os
import re

import arabic_reshaper
from bidi.algorithm import get_display
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import ParagraphStyle

_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo.png")
COMPANY_PHONES = ["+218915002525", "+218911252525", "+218917252525"]
BRAND_COLOR = colors.HexColor("#2563EB")

_ARABIC_FONT_CANDIDATES = [
    os.environ.get("ARABIC_FONT_PATH", ""),
    # Bundled first and preferred: relying on whatever Arabic font happens to already be
    # installed on the host OS is not portable — a shared hosting box (or any machine
    # without a full-coverage font) can silently fall through to something like
    # DroidSansArabic, which only covers the Arabic block and has no Latin/digit/
    # punctuation glyphs of its own, rendering every number, currency code, and id as
    # tofu boxes while pure-Arabic text still looks fine. Noto Sans Arabic covers all
    # three (Arabic, Latin, digits) in one file, so PDFs render identically everywhere.
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "NotoSansArabic-Regular.ttf"),
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\calibri.ttf",
    # Linux fallbacks (installed via `apt install fonts-noto-core` or `fonts-kacst`)
    "/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
    "/usr/share/fonts/truetype/kacst/KacstOne.ttf",
    "/usr/share/fonts/google-droid/DroidSansArabic.ttf",
]

_FONT_NAME = "ArabicReportFont"
_font_registered = False


class ArabicFontUnavailable(Exception):
    pass


def _ensure_font_registered() -> str:
    global _font_registered
    if _font_registered:
        return _FONT_NAME
    for path in _ARABIC_FONT_CANDIDATES:
        if path and os.path.exists(path):
            pdfmetrics.registerFont(TTFont(_FONT_NAME, path))
            _font_registered = True
            return _FONT_NAME
    raise ArabicFontUnavailable(
        "No Arabic-capable font found on this machine for PDF export. "
        "Set the ARABIC_FONT_PATH environment variable to a .ttf file that supports Arabic."
    )


_ARABIC_CHAR_RE = re.compile(r'[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]')


def _wrap_before_shaping(text: str, max_width_pts: float, font_name: str, font_size: float) -> list[str]:
    """Splits text into lines that actually fit max_width_pts (on whitespace
    where possible) BEFORE reshaping, measured with the real font/size so short
    text that fits on one line is never split. Reshaping + bidi-reordering a
    string assumes it renders as a single line; if reportlab's Paragraph then
    has to wrap that already visually-reordered string across multiple lines
    (because it doesn't fit its column), the wrap point cuts through visual
    order, not logical order — the tail of the sentence ends up on the first
    line and the head on the second, reading as scrambled fragments.
    Pre-splitting on logical text and reshaping each piece independently keeps
    each line internally correct and keeps the lines themselves in
    top-to-bottom reading order."""
    if pdfmetrics.stringWidth(text, font_name, font_size) <= max_width_pts:
        return [text]
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width_pts:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [text]


def shape_arabic(text, max_width_pts: float | None = None, font_name: str = _FONT_NAME, font_size: float = 9) -> str:
    """Reshape + bidi-reorder a string for correct PDF rendering. Non-string /
    empty values pass through as an empty cell rather than raising.

    Cells with no Arabic characters at all (IDs, dates, currency codes,
    amounts) skip reshaping/bidi entirely — running them through that
    pipeline anyway was turning them into strings of NUL glyphs once passed
    to reportlab's font subsetting, silently blanking every non-Arabic
    column in every PDF export (numbers, dates, transaction IDs — only
    genuinely-Arabic cells like customer names survived).

    Pass max_width_pts (with the actual font_name/font_size that will render
    it) when the text sits in a width-constrained cell/column — text measured
    wider than that gets pre-wrapped onto multiple lines *before* reshaping
    (see _wrap_before_shaping for why the order matters). Leave max_width_pts
    unset for text with no meaningful width constraint (a full-width title, a
    footer line) — pre-wrapping short text that was never going to wrap just
    to be safe only produces awkward, unnecessary line breaks.

    The result is escaped and may contain literal "<br/>" tags — always render
    it inside a reportlab Paragraph (which treats its content as mini-markup),
    never as a plain string, or both the escaping and the line breaks show up
    as literal text instead of doing their job."""
    if text is None:
        return ""
    text = str(text)
    if not _ARABIC_CHAR_RE.search(text):
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    lines = _wrap_before_shaping(escaped, max_width_pts, font_name, font_size) if max_width_pts else [escaped]
    return "<br/>".join(get_display(arabic_reshaper.reshape(line)) for line in lines)


# Free-text columns (notes, descriptions) need far more room than a serial
# number or a currency code — splitting the page evenly across all columns
# was squeezing "ملاحظات"/"البيان"/"التفاصيل" text into a handful of cramped,
# heavily-wrapped lines. These get extra weight; everything else stays equal.
_WIDE_COLUMN_KEYWORDS = ("ملاحظات", "البيان", "التفاصيل", "الوصف")
_WIDE_COLUMN_FACTOR = 3.0

# Name-ish columns (who did it, which account/vehicle/counterparty) usually
# hold a short phrase rather than a single word or number — "مدير النظام
# الرئيسي", "land cruiser", a customer or account name — one weight unit
# wrapped these into a near-unreadable, multi-line sliver on statements with
# many columns (the شركة بيان statement has 12). Not as wide as free text,
# but noticeably more than a code/date/amount column. Substring-matched, EXCEPT
# "من"/"إلى" which must match the whole header exactly — as a substring they'd
# also catch "من عملة"/"إلى عملة" (a currency-code column, short content that
# doesn't need the extra room).
_MEDIUM_WIDE_COLUMN_KEYWORDS = ("بواسطة", "المركبة", "الحساب", "العميل", "الخزنة", "المصدر", "الوجهة")
_MEDIUM_WIDE_COLUMN_EXACT = ("من", "إلى")
_MEDIUM_WIDE_COLUMN_FACTOR = 1.7

def _style_for(text, arabic_style: ParagraphStyle, latin_style: ParagraphStyle) -> ParagraphStyle:
    """wordWrap="CJK" (break anywhere, no space needed) is what correctly wraps
    Arabic inside a narrow cell, but applied to Latin content (a vehicle name,
    an English username, an account name) it breaks mid-word instead of at
    the actual spaces — "land cruiser" as "land cru"/"iser". Picks the style
    without that override for cells with no Arabic in them, so Latin text
    wraps normally."""
    return arabic_style if _ARABIC_CHAR_RE.search(str(text) if text is not None else "") else latin_style


def _column_weights(headers: list[str]) -> list[float]:
    weights = []
    for h in headers:
        if any(k in h for k in _WIDE_COLUMN_KEYWORDS):
            weights.append(_WIDE_COLUMN_FACTOR)
        elif h in _MEDIUM_WIDE_COLUMN_EXACT or any(k in h for k in _MEDIUM_WIDE_COLUMN_KEYWORDS):
            weights.append(_MEDIUM_WIDE_COLUMN_FACTOR)
        else:
            weights.append(1.0)
    return weights

def _weighted_col_widths(headers: list[str], content_width: float) -> list[float]:
    weights = _column_weights(headers)
    total = sum(weights) or 1.0
    return [content_width * w / total for w in weights]

def _excel_col_widths(headers: list[str]) -> list[float]:
    return [45 if w > 1.0 else 18 for w in _column_weights(headers)]


def build_excel(sheet_title: str, headers: list[str], rows: list[list]) -> io.BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]  # Excel sheet name length limit
    ws.sheet_view.rightToLeft = True

    header_font = Font(bold=True)
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    wide_cols = {i for i, w in enumerate(_column_weights(headers), start=1) if w > 1.0}
    for row_idx, row in enumerate(rows, start=2):
        for col_idx, value in enumerate(row, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            if col_idx in wide_cols:
                cell.alignment = Alignment(horizontal="right", wrap_text=True)

    for col_idx, width in enumerate(_excel_col_widths(headers), start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def build_pdf(title: str, headers: list[str], rows: list[list]) -> io.BytesIO:
    font_name = _ensure_font_registered()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm)
    content_width = landscape(A4)[0] - 3 * cm

    title_style = ParagraphStyle("ArabicTitle", fontName=font_name, fontSize=16, alignment=1, spaceAfter=12)
    elements = [Paragraph(shape_arabic(title), title_style), Spacer(1, 0.5 * cm)]

    # Cells are wrapped in Paragraph (not plain strings) for two reasons: long
    # content wraps onto extra lines within its own cell instead of overflowing
    # into the next one, and shape_arabic()'s output may itself contain markup
    # (escaped "&"/"<"/">", literal "<br/>" line breaks) that only a Paragraph
    # interprets — a plain string would show that markup as literal text.
    header_style = ParagraphStyle("PdfHeader", fontName=font_name, fontSize=9, alignment=1, textColor=colors.white, wordWrap="CJK")
    header_style_latin = ParagraphStyle("PdfHeaderLatin", fontName=font_name, fontSize=9, alignment=1, textColor=colors.white)
    cell_style = ParagraphStyle("PdfCell", fontName=font_name, fontSize=9, alignment=1, wordWrap="CJK")
    cell_style_latin = ParagraphStyle("PdfCellLatin", fontName=font_name, fontSize=9, alignment=1)
    # Explicit per-column widths — a free-text column (notes/details) gets
    # several times the width of a narrow one (serial number, currency code)
    # instead of splitting the page evenly, both for the actual table layout
    # and for how much text shape_arabic() pre-wraps into each cell.
    col_widths = _weighted_col_widths(headers, content_width)
    rev_widths = list(reversed(col_widths))

    # Arabic reads right-to-left, so the header/row columns are reversed for display
    # while keeping the shaped text itself correctly ordered per-cell.
    display_headers = [Paragraph(shape_arabic(h, rev_widths[i] - 6, font_name, 9), _style_for(h, header_style, header_style_latin)) for i, h in enumerate(reversed(headers))]
    display_rows = [[Paragraph(shape_arabic(cell, rev_widths[i] - 6, font_name, 9), _style_for(cell, cell_style, cell_style_latin)) for i, cell in enumerate(reversed(row))] for row in rows]

    table_data = [display_headers] + display_rows
    table = Table(table_data, repeatRows=1, colWidths=rev_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E40AF")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)

    doc.build(elements)
    buf.seek(0)
    return buf


def build_statement_pdf(customer_name: str, customer_phone: str, customer_id_number: str, headers: list[str], rows: list[list], closing_line: str = "") -> io.BytesIO:
    """A customer account statement — the branded letterhead (logo, company name,
    phone numbers) plus a customer info block, then a wide ledger table (date,
    details, debit, credit, balance) in build_pdf's same style, and an optional
    closing line (e.g. the final balance) underneath."""
    font_name = _ensure_font_registered()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1 * cm, bottomMargin=1 * cm)
    content_width = landscape(A4)[0] - 3 * cm

    company_style = ParagraphStyle("StatementCompany", fontName=font_name, fontSize=15, leading=19, alignment=1, textColor=BRAND_COLOR, spaceAfter=2)
    contact_style = ParagraphStyle("StatementContact", fontName=font_name, fontSize=8, leading=11, alignment=1, textColor=colors.grey)
    info_style = ParagraphStyle("StatementInfo", fontName=font_name, fontSize=10, leading=14, alignment=1, spaceAfter=2)
    closing_style = ParagraphStyle("StatementClosing", fontName=font_name, fontSize=11, leading=15, alignment=1, spaceBefore=10)

    elements = []
    if os.path.exists(_LOGO_PATH):
        logo = Image(_LOGO_PATH, width=1.5 * cm, height=1.5 * cm)
        logo.hAlign = "CENTER"
        elements.append(logo)
        elements.append(Spacer(1, 0.1 * cm))
    elements.append(Paragraph(shape_arabic("شركة واكب للخدمات المالية"), company_style))
    elements.append(Paragraph(" | ".join(COMPANY_PHONES), contact_style))
    elements.append(Spacer(1, 0.3 * cm))

    elements.append(Paragraph(shape_arabic(f"كشف حساب — {customer_name}"), info_style))
    info_line = f"الهاتف: {customer_phone}" + (f"  —  الرقم الوطني: {customer_id_number}" if customer_id_number else "")
    elements.append(Paragraph(shape_arabic(info_line), info_style))
    elements.append(Spacer(1, 0.4 * cm))

    header_style = ParagraphStyle("StatementHeader", fontName=font_name, fontSize=9, alignment=1, textColor=colors.white, wordWrap="CJK")
    cell_style = ParagraphStyle("StatementCell", fontName=font_name, fontSize=9, alignment=1, wordWrap="CJK")
    approx_col_width = content_width / max(len(headers), 1) - 6
    display_headers = [Paragraph(shape_arabic(h, approx_col_width, font_name, 9), header_style) for h in reversed(headers)]
    display_rows = [[Paragraph(shape_arabic(cell, approx_col_width, font_name, 9), cell_style) for cell in reversed(row)] for row in rows]
    table_data = [display_headers] + display_rows
    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_COLOR),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)

    if closing_line:
        elements.append(Paragraph(shape_arabic(closing_line), closing_style))

    doc.build(elements)
    buf.seek(0)
    return buf


def build_sectioned_excel(sections: list[tuple[str, list[str], list[list]]]) -> io.BytesIO:
    """Like build_excel, but for a statement that must stay separated by kind
    (e.g. trades / deposits-withdrawals / debts / advances) instead of one
    merged chronological table. All sections land on ONE sheet, stacked top to
    bottom under their own bold title row and blank separator, rather than one
    sheet per section — reading the whole statement means scrolling one sheet,
    not clicking through tabs."""
    wb = Workbook()
    ws = wb.active
    ws.title = "كشف الحساب"
    ws.sheet_view.rightToLeft = True

    max_cols = max((len(headers) for _, headers, _ in sections), default=1)
    title_font = Font(bold=True, size=12, color="FFFFFF")
    title_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
    header_font = Font(bold=True)
    row_idx = 1
    for name, headers, rows in sections:
        title_cell = ws.cell(row=row_idx, column=1, value=name)
        title_cell.font = title_font
        title_cell.fill = title_fill
        title_cell.alignment = Alignment(horizontal="center")
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=max(len(headers), 1))
        for col_idx in range(2, len(headers) + 1):
            ws.cell(row=row_idx, column=col_idx).fill = title_fill
        row_idx += 1

        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=header)
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        row_idx += 1

        wide_cols = {i for i, w in enumerate(_column_weights(headers), start=1) if w > 1.0}
        if not rows:
            ws.cell(row=row_idx, column=1, value="لا توجد بيانات").alignment = Alignment(horizontal="center")
            if len(headers) > 1:
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=len(headers))
            row_idx += 1
        else:
            for row in rows:
                for col_idx, value in enumerate(row, start=1):
                    cell = ws.cell(row=row_idx, column=col_idx, value=value)
                    if col_idx in wide_cols:
                        cell.alignment = Alignment(horizontal="right", wrap_text=True)
                row_idx += 1

        row_idx += 1  # blank separator row before the next section

    widest_headers = max((headers for _, headers, _ in sections), key=len, default=[])
    for col_idx, width in enumerate(_excel_col_widths(widest_headers), start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def build_sectioned_pdf(
    title: str, sections: list[tuple[str, list[str], list[list]]], closing_line: str = "",
    subtitle_lines: list[str] | None = None,
) -> io.BytesIO:
    """Like build_statement_pdf, but for a statement kept separated by kind —
    each (name, headers, rows) renders as its own titled table, one under the
    other in a single continuous flow (not one per page) — reportlab paginates
    automatically wherever a table happens to run long, same as any other
    multi-page document, rather than forcing every category onto its own page.
    The logo, company name and a page number are drawn directly on every page
    (not just the first) via the onPage callback below, since a page break can
    land anywhere once sections are no longer pinned one-per-page."""
    font_name = _ensure_font_registered()
    buf = io.BytesIO()
    page_width, page_height = landscape(A4)
    # Extra top/bottom margin reserves room for the letterhead and page number
    # drawn on the canvas itself (outside the normal flowable area) below.
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=2.8 * cm, bottomMargin=1.3 * cm)
    content_width = page_width - 3 * cm

    info_style = ParagraphStyle("SectionedInfo", fontName=font_name, fontSize=10, leading=14, alignment=1, spaceAfter=2)
    section_title_style = ParagraphStyle("SectionedSectionTitle", fontName=font_name, fontSize=12, leading=16, alignment=1, textColor=colors.white, spaceAfter=0)
    empty_style = ParagraphStyle("SectionedEmpty", fontName=font_name, fontSize=9, leading=12, alignment=1, textColor=colors.grey)
    closing_style = ParagraphStyle("SectionedClosing", fontName=font_name, fontSize=11, leading=15, alignment=1, spaceBefore=10)

    def draw_page_furniture(canvas, _doc):
        canvas.saveState()
        if os.path.exists(_LOGO_PATH):
            logo_size = 1.2 * cm
            canvas.drawImage(_LOGO_PATH, (page_width - logo_size) / 2, page_height - 0.3 * cm - logo_size,
                              width=logo_size, height=logo_size, mask="auto", preserveAspectRatio=True)
        canvas.setFont(font_name, 13)
        canvas.setFillColor(BRAND_COLOR)
        canvas.drawCentredString(page_width / 2, page_height - 1.85 * cm, get_display(arabic_reshaper.reshape("شركة واكب للخدمات المالية")))
        canvas.setFont(font_name, 8)
        canvas.setFillColor(colors.grey)
        canvas.drawCentredString(page_width / 2, page_height - 2.25 * cm, " | ".join(COMPANY_PHONES))
        canvas.drawCentredString(page_width / 2, 0.7 * cm, get_display(arabic_reshaper.reshape(f"صفحة {canvas.getPageNumber()}")))
        canvas.restoreState()

    elements = []
    elements.append(Paragraph(shape_arabic(title), info_style))
    for line in (subtitle_lines or []):
        elements.append(Paragraph(shape_arabic(line), info_style))
    elements.append(Spacer(1, 0.4 * cm))

    header_style = ParagraphStyle("SectionedHeader", fontName=font_name, fontSize=9, alignment=1, textColor=colors.white, wordWrap="CJK")
    header_style_latin = ParagraphStyle("SectionedHeaderLatin", fontName=font_name, fontSize=9, alignment=1, textColor=colors.white)
    cell_style = ParagraphStyle("SectionedCell", fontName=font_name, fontSize=9, alignment=1, wordWrap="CJK")
    cell_style_latin = ParagraphStyle("SectionedCellLatin", fontName=font_name, fontSize=9, alignment=1)

    for name, headers, rows in sections:
        title_table = Table([[Paragraph(shape_arabic(name), section_title_style)]], colWidths=[content_width])
        title_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BRAND_COLOR),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(title_table)

        if not rows:
            elements.append(Paragraph(shape_arabic("لا توجد بيانات"), empty_style))
            elements.append(Spacer(1, 0.4 * cm))
        else:
            col_widths = _weighted_col_widths(headers, content_width)
            rev_widths = list(reversed(col_widths))
            display_headers = [Paragraph(shape_arabic(h, rev_widths[i] - 6, font_name, 9), _style_for(h, header_style, header_style_latin)) for i, h in enumerate(reversed(headers))]
            display_rows = [[Paragraph(shape_arabic(cell, rev_widths[i] - 6, font_name, 9), _style_for(cell, cell_style, cell_style_latin)) for i, cell in enumerate(reversed(row))] for row in rows]
            table_data = [display_headers] + display_rows
            table = Table(table_data, repeatRows=1, colWidths=rev_widths)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E40AF")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 0.4 * cm))

    if closing_line:
        elements.append(Paragraph(shape_arabic(closing_line), closing_style))

    doc.build(elements, onFirstPage=draw_page_furniture, onLaterPages=draw_page_furniture)
    buf.seek(0)
    return buf


def build_receipt_pdf(title: str, subtitle: str, fields: list[tuple[str, str]], footer: str = "") -> io.BytesIO:
    """A single-record printable slip — landscape, with each field as its own
    column (a header row of labels above a row of values) rather than a tall
    stack of label/value rows. Carries the company logo, name and contact
    numbers as a letterhead, with the operation title as a solid brand-colored band."""
    font_name = _ensure_font_registered()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1 * cm, bottomMargin=1 * cm,
    )
    content_width = landscape(A4)[0] - 3 * cm

    company_style = ParagraphStyle("ReceiptCompany", fontName=font_name, fontSize=16, leading=20, alignment=1, textColor=BRAND_COLOR, spaceAfter=4)
    contact_style = ParagraphStyle("ReceiptContact", fontName=font_name, fontSize=9, leading=12, alignment=1, textColor=colors.grey, spaceAfter=0)
    footer_style = ParagraphStyle("ReceiptFooter", fontName=font_name, fontSize=8, leading=11, alignment=1, textColor=colors.grey)

    elements = []
    if os.path.exists(_LOGO_PATH):
        logo = Image(_LOGO_PATH, width=1.8 * cm, height=1.8 * cm)
        logo.hAlign = "CENTER"
        elements.append(logo)
        elements.append(Spacer(1, 0.15 * cm))
    elements.append(Paragraph(shape_arabic(subtitle), company_style))
    elements.append(Paragraph(" | ".join(COMPANY_PHONES), contact_style))
    elements.append(Spacer(1, 0.4 * cm))

    title_band_style = ParagraphStyle("ReceiptTitleBand", fontName=font_name, fontSize=13, alignment=1, textColor=colors.white)
    title_table = Table([[Paragraph(shape_arabic(title), title_band_style)]], colWidths=[content_width])
    title_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_COLOR),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    elements.append(Spacer(1, 0.4 * cm))

    # Fields laid out horizontally: a header row of labels above a row of values.
    # Arabic reads right-to-left, so the column order is reversed like build_pdf does.
    # Cells are wrapped in Paragraph (not plain strings) so long content — a long
    # customer name, an id with no spaces to break on — wraps onto extra lines
    # within its own column instead of visually overflowing into the next one.
    field_label_style = ParagraphStyle("ReceiptFieldLabel", fontName=font_name, fontSize=8.5, leading=11, alignment=1, textColor=BRAND_COLOR, wordWrap="CJK")
    field_value_style = ParagraphStyle("ReceiptFieldValue", fontName=font_name, fontSize=9, leading=12, alignment=1, wordWrap="CJK")
    col_width = content_width / len(fields)
    approx_cell_width = col_width - 6
    display_labels = [Paragraph(shape_arabic(label, approx_cell_width, font_name, 8.5), field_label_style) for label, _ in reversed(fields)]
    display_values = [Paragraph(shape_arabic(value, approx_cell_width, font_name, 9), field_value_style) for _, value in reversed(fields)]
    table = Table([display_labels, display_values], colWidths=[col_width] * len(fields))
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EFF6FF")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(table)

    if footer:
        elements.append(Spacer(1, 0.8 * cm))
        elements.append(Paragraph(shape_arabic(footer), footer_style))

    doc.build(elements)
    buf.seek(0)
    return buf
