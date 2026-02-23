import * as React from "react";

import {
  Table as AxisTable,
  TableHeader as AxisTableHeader,
  TableBody as AxisTableBody,
  TableRow as AxisTableRow,
  TableHead as AxisTableHead,
  TableCell as AxisTableCell,
  TableFooter as AxisTableFooter,
  TableCaption as AxisTableCaption,
} from "@axis-ds/ui-react";

import { cn } from "~/lib/utils/cn";

/**
 * DS Table 래퍼.
 * DS 기본 wrapper(`overflow-auto`)를 프로젝트 스타일(`rounded-lg border`)로 교체.
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="overflow-hidden rounded-lg border border-line-subtle">
      <AxisTable ref={ref} className={className} {...props} />
    </div>
  )
);
Table.displayName = "Table";

// DS TableHeader + 프로젝트 배경색
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <AxisTableHeader ref={ref} className={cn("bg-surface-secondary", className)} {...props} />
  )
);
TableHeader.displayName = "TableHeader";

// DS TableBody + 프로젝트 divide/배경
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <AxisTableBody ref={ref} className={cn("divide-y divide-line-subtle bg-surface-card", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

// DS TableRow 그대로 (hover/transition 이미 DS에 포함)
const TableRow = AxisTableRow;

// DS TableHead + 프로젝트 스타일 오버라이드 (font-semibold, py-3.5, text-fg)
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <AxisTableHead ref={ref} className={cn("py-3.5 text-sm font-semibold text-fg", className)} {...props} />
  )
);
TableHead.displayName = "TableHead";

// DS TableCell + 프로젝트 text-sm text-fg-secondary
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <AxisTableCell ref={ref} className={cn("text-sm text-fg-secondary", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

// DS 추가 컴포넌트 re-export
const TableFooter = AxisTableFooter;
const TableCaption = AxisTableCaption;

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption };
