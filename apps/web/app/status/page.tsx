


import { STATUS_URL } from '@/lib/constants';
import { redirect } from 'next/navigation';

export default function StatusPage() {
  redirect(STATUS_URL);
} 