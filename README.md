# E-MATHTOCO Frontend

Frontend web E-MATHTOCO memakai Next.js 16, TypeScript, Tailwind CSS, Supabase SSR/client, dan integrasi FastAPI backend.

## Lokasi penting

- App: `D:\PTA\Emathtoco_Project\Emathtoco_FrontEnd\Emathtoco_Web`
- Dokumentasi utama: `D:\PTA\Emathtoco_Project\Emathtoco_AgentDocs`
- Backend: `D:\PTA\Emathtoco_Project\Emathoco_BackEnd`
- Supabase utama: `https://hkxxhactpwiqdzecrbxw.supabase.co`

## Perintah lokal

```powershell
npm install
npm run dev
```

Validasi sebelum push:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

## Environment utama

Minimal `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hkxxhactpwiqdzecrbxw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Untuk uji Vercel + backend lokal, `NEXT_PUBLIC_API_URL` dapat diarahkan ke URL HTTPS ngrok aktif. Untuk VPS, gunakan domain Caddy `https://api.<VPS-IP-dashed>.sslip.io`.

## Catatan arsitektur

- Auth memakai Supabase SSR dan `proxy.ts`, bukan cookie manual `sb-access-token`.
- UI mahasiswa tetap upload 24 section.
- Review dosen menampilkan jawaban mahasiswa dan Soal (section) privat.
- Prediksi AI dipicu ke FastAPI, lalu diproses Redis/RQ worker.
- Jangan simpan service-role key di frontend.

Mulai baca dokumentasi dari `Emathtoco_AgentDocs/Brain/INDEX.md` sebelum mengubah flow besar.
