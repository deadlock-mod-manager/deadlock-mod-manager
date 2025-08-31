import { redirect } from 'next/navigation';
import { DOWNLOAD_URL } from '@/lib/constants';

export default function DownloadPage() {
  redirect(DOWNLOAD_URL);
}
