import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function usePagination<T>(items: T[] = [], itemsPerPage: number = 10) {
  const [page, setPage] = useState(1);
  
  const safeItems = Array.isArray(items) ? items : [];
  const totalPages = Math.ceil(safeItems.length / itemsPerPage) || 1;
  const paginatedItems = safeItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const PaginationControls = () => {
    const { t, isRTL } = useI18n();
    
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-xs text-muted-foreground">
          {t('showing')} {(page - 1) * itemsPerPage + 1} {t('to')} {Math.min(page * itemsPerPage, safeItems.length)} {t('of')} {safeItems.length} {t('entries')}
        </span>
        <div className="flex items-center gap-1" dir={isRTL ? "rtl" : "ltr"}>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <span className="flex items-center px-3 text-xs font-medium text-muted-foreground">{page} / {totalPages}</span>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  };

  return { page, setPage, paginatedItems, PaginationControls };
}
