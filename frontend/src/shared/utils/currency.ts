export const formatSoles = (amount: number | string | null | undefined) => `S/ ${Number(amount || 0).toFixed(2)}`;
