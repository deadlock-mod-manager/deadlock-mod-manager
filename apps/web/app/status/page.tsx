import { redirect } from 'next/navigation';
import { STATUS_URL } from '@/lib/constants';

export default function StatusPage() {
  redirect(STATUS_URL);
}
