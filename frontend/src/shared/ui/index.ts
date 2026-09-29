// Componentes base del sistema. Las pantallas importan desde aquí:
//   import { Button, Card, PageHeader, Field, Input, Table, Badge, EmptyState, Modal, useToast } from '../shared/ui/index.ts';
export { default as Button } from './Button.tsx';
export { default as Card } from './Card.tsx';
export { default as PageHeader } from './PageHeader.tsx';
export { default as Badge } from './Badge.tsx';
export { default as EmptyState } from './EmptyState.tsx';
export { default as Modal } from './Modal.tsx';
export { Field, Input, Select, Textarea, SearchInput } from './Field.tsx';
export { Table, THead, TBody, Th, Tr, Td } from './Table.tsx';
export { Skeleton, SkeletonTable, SkeletonCards } from './Skeleton.tsx';
export { ToastProvider, useToast } from './Toaster.tsx';
export { ConfirmProvider, useConfirm } from './ConfirmDialog.tsx';
export { default as Pagination, usePagination, PAGE_SIZE } from './Pagination.tsx';
