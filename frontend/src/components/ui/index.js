// Componentes base del sistema. Las pantallas importan desde aquí:
//   import { Button, Card, PageHeader, Field, Input, Table, Badge, EmptyState, Modal, useToast } from '../components/ui/index.js';
export { default as Button } from './Button.jsx';
export { default as Card } from './Card.jsx';
export { default as PageHeader } from './PageHeader.jsx';
export { default as Badge } from './Badge.jsx';
export { default as EmptyState } from './EmptyState.jsx';
export { default as Modal } from './Modal.jsx';
export { Field, Input, Select, Textarea, SearchInput } from './Field.jsx';
export { Table, THead, TBody, Th, Tr, Td } from './Table.jsx';
export { Skeleton, SkeletonTable, SkeletonCards } from './Skeleton.jsx';
export { ToastProvider, useToast } from './Toaster.jsx';
export { ConfirmProvider, useConfirm } from './ConfirmDialog.jsx';
export { default as Pagination, usePagination, PAGE_SIZE } from './Pagination.jsx';
