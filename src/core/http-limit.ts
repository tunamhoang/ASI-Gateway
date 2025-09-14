import pLimit from 'p-limit';
export const httpLimit = pLimit(Number(process.env.HTTP_CONCURRENCY || 5)); // bắt đầu 5
