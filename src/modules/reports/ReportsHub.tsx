import { ArrowLeftRight, Users, Banknote, ShieldCheck, CreditCard, TrendingUp, Building2, FileText, ChevronLeft } from 'lucide-react';
import { PageId } from '../../config/permissions';

interface Props { onNavigate: (page: PageId) => void; }

const REPORT_TILES: { id: PageId; title: string; description: string; icon: typeof ArrowLeftRight }[] = [
  { id: 'reports-daily', title: 'تقرير العمليات', description: 'كل عمليات البيع والشراء والتبديل خلال فترة محددة، مع توزيعها حسب النوع والعملة', icon: ArrowLeftRight },
  { id: 'reports-profit', title: 'تقرير الأرباح', description: 'صافي الأرباح المحققة من فروق أسعار الصرف والعمولات لكل فترة', icon: TrendingUp },
  { id: 'reports-vaults', title: 'تقرير الخزنات', description: 'أرصدة كل خزنة بجميع العملات ومقارنتها', icon: Banknote },
  { id: 'reports-customers', title: 'تقرير العملاء', description: 'أكثر العملاء نشاطاً، أرصدتهم، وديونهم المفتوحة', icon: Users },
  { id: 'reports-debts', title: 'تقرير الديون', description: 'الديون المفتوحة والمتأخرة ومواعيد استحقاقها', icon: CreditCard },
  { id: 'reports-audit', title: 'سجل المراجعة', description: 'كل إجراء تم تنفيذه في النظام — من قام به، ومتى', icon: ShieldCheck },
  { id: 'asset-reports', title: 'تقارير الأصول', description: 'السيارات والعقارات — القيمة، الإهلاك، والمستندات القريبة من الانتهاء', icon: Building2 },
  { id: 'accounting', title: 'سجل العمليات المحاسبي', description: 'القيود المحاسبية الكاملة لكل عملية، بصيغة مزدوجة القيد', icon: FileText },
];

export default function ReportsHub({ onNavigate }: Props) {
  return (
    <div className="page-content">
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>التقارير</h1>
        <p style={{ color: 'var(--gray)', fontSize: '0.875rem', marginTop: '0.25rem' }}>اختر تقريراً لعرضه في صفحة مستقلة</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
        {REPORT_TILES.map(tile => (
          <button
            key={tile.id}
            onClick={() => onNavigate(tile.id)}
            className="section-card"
            style={{
              padding: '1.35rem', textAlign: 'right', cursor: 'pointer', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '0.85rem', transition: 'var(--transition)'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="kpi-icon-wrapper blue"><tile.icon size={19} /></div>
              <ChevronLeft size={16} color="var(--gray)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--primary)', marginBottom: '0.35rem' }}>{tile.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.6 }}>{tile.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
