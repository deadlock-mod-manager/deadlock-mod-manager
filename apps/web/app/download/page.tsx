import { DOWNLOAD_URL } from '@/lib/constants';
import { redirect } from 'next/navigation';

export default function DownloadPage() {
  redirect(DOWNLOAD_URL);
} 