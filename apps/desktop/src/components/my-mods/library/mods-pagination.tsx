import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@deadlock-mods/ui/components/pagination";
import { ChevronLeft, ChevronRight } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function ModsPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.previous")}
            aria-disabled={page === 0}
            className={cn(
              "gap-1 pl-2.5",
              page === 0 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onPageChange(page - 1);
            }}>
            <ChevronLeft className='h-4 w-4' />
            <span>{t("pagination.previous")}</span>
          </PaginationLink>
        </PaginationItem>
        {Array.from({ length: totalPages }, (_, i) => i)
          .filter((i) => {
            if (totalPages <= 7) return true;
            if (i === 0 || i === totalPages - 1) return true;
            return Math.abs(i - page) <= 2;
          })
          .reduce<(number | "ellipsis")[]>((acc, i, idx, arr) => {
            if (idx > 0 && arr[idx - 1] < i - 1) acc.push("ellipsis");
            acc.push(i);
            return acc;
          }, [])
          .map((item, idx, items) =>
            item === "ellipsis" ? (
              <PaginationItem
                key={`ellipsis-${items[idx - 1]}-${items[idx + 1]}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  isActive={item === page}
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(item);
                  }}>
                  {item + 1}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.next")}
            aria-disabled={page === totalPages - 1}
            className={cn(
              "gap-1 pr-2.5",
              page === totalPages - 1 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page < totalPages - 1) onPageChange(page + 1);
            }}>
            <span>{t("pagination.next")}</span>
            <ChevronRight className='h-4 w-4' />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
