import { redirect } from 'next/navigation';

export default function AuditDebugRedirectPage() {
  redirect('/admin/audit');
}
