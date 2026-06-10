'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, IdCard, GraduationCap, Edit3, Save, X, Loader2, Camera, CheckCircle2, Trash2, Eye, AlertTriangle } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '@/lib/supabase';
import Cropper from 'react-easy-crop';

const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

const getCroppedImg = (
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const image = new window.Image();
        if (!imageSrc.startsWith('data:')) {
            image.crossOrigin = 'anonymous';
        }
        image.src = imageSrc;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Canvas context could not be created'));
                return;
            }

            // Paint white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 512, 512);

            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                512,
                512
            );

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                },
                'image/jpeg',
                0.9
            );
        };
        image.onerror = (err) => {
            reject(err);
        };
    });
};

export default function ProfilePage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('mahasiswa');
    const [fotoProfilUrl, setFotoProfilUrl] = useState<string | null>(null);
    const [imageError, setImageError] = useState(false);
    
    // Form fields state
    const [namaLengkap, setNamaLengkap] = useState('');
    const [nimNip, setNimNip] = useState('');
    const [kelas, setKelas] = useState('');

    // Original copies to discard edits
    const [origNama, setOrigNama] = useState('');
    const [origNim, setOrigNim] = useState('');
    const [origKelas, setOrigKelas] = useState('');

    const [isChecking, setIsChecking] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Cropper State variables
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUploadError(null);
        setUploadSuccess(null);
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation limits
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setUploadError("Format file tidak didukung. Harap pilih file JPG, JPEG, PNG, atau WEBP.");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setUploadError("Ukuran file melebihi batas 2 MB.");
            return;
        }

        const reader = new FileReader();
        reader.addEventListener('load', () => {
            const dataUrl = reader.result as string;
            setImageSrc(dataUrl);
            
            const img = new window.Image();
            img.src = dataUrl;
            img.onload = () => {
                setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                setIsCropModalOpen(true);
            };
        });
        reader.readAsDataURL(file);
    };

    const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleSaveAvatar = async () => {
        if (!userId || !imageSrc || !croppedAreaPixels) return;

        setIsUploading(true);
        setUploadError(null);
        setUploadSuccess(null);

        console.log("handleSaveAvatar initiated for user:", userId);

        try {
            // 1. Generate crop blob using HTML5 Canvas
            const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
            console.log("Generated crop blob:", blob);

            const filePath = `${userId}/avatar.jpg`;
            // Clean up: delete existing file first to ensure storage and CDN refresh completely
            try {
                await supabase.storage.from('profile-images').remove([filePath]);
                console.log("Old file deleted from storage before re-upload.");
            } catch (e) {
                console.log("No old file to delete or delete failed, continuing...");
            }

            const { error: uploadErr } = await supabase.storage
                .from('profile-images')
                .upload(filePath, blob, {
                    contentType: 'image/jpeg',
                    upsert: true,
                    cacheControl: '0'
                });

            if (uploadErr) {
                console.error("Storage upload error details:", uploadErr);
                throw new Error(`Gagal mengunggah foto: ${uploadErr.message}`);
            }

            console.log("Storage upload successful!");

            // 3. Retrieve the public URL and append cache-buster
            const { data: { publicUrl: rawPublicUrl } } = supabase.storage
                .from('profile-images')
                .getPublicUrl(filePath);

            const publicUrl = `${rawPublicUrl}?t=${Date.now()}`;
            console.log("Retrieved storage public URL:", publicUrl);

            // 4. Update the DB table
            console.log("Updating database table public.profil_pengguna with foto_profil_url...");
            const { error: dbErr } = await supabase
                .from('profil_pengguna')
                .update({ foto_profil_url: publicUrl })
                .eq('id', userId);

            if (dbErr) {
                console.error("DB update error details:", dbErr);
                throw new Error(`Gagal menyimpan ke database: ${dbErr.message}`);
            }

            console.log("DB update successful!");

            // 5. Dispatch sync event
            window.dispatchEvent(new CustomEvent('avatar-update', { detail: publicUrl }));
            setFotoProfilUrl(publicUrl);
            setImageError(false);
            setUploadSuccess("Foto profil berhasil diperbarui.");
            setIsCropModalOpen(false);

            // Reset inputs
            setImageSrc(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (err: any) {
            console.error("handleSaveAvatar caught error:", err);
            setUploadError(err.message || "Terjadi kesalahan saat menyimpan foto profil.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteAvatar = () => {
        if (!userId) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeleteAvatar = async () => {
        setShowDeleteConfirm(false);
        setIsUploading(true);
        setUploadError(null);
        setUploadSuccess(null);
        setIsViewModalOpen(false);

        console.log("confirmDeleteAvatar initiated for user:", userId);

        try {
            // 1. Delete from Supabase Storage bucket 'profile-images'
            const filePath = `${userId}/avatar.jpg`;
            console.log("Removing file from storage path:", filePath);
            const { error: storageErr } = await supabase.storage
                .from('profile-images')
                .remove([filePath]);

            if (storageErr) {
                console.error("Storage delete error details:", storageErr);
            } else {
                console.log("Storage file deleted successfully!");
            }

            // 2. Update the DB table
            console.log("Resetting foto_profil_url to null in profil_pengguna...");
            const { error: dbErr } = await supabase
                .from('profil_pengguna')
                .update({ foto_profil_url: null })
                .eq('id', userId);

            if (dbErr) {
                console.error("DB update error details:", dbErr);
                throw new Error(`Gagal menghapus dari database: ${dbErr.message}`);
            }

            console.log("DB update successful!");

            // 3. Dispatch sync event
            window.dispatchEvent(new CustomEvent('avatar-update', { detail: null }));
            setFotoProfilUrl(null);
            setImageError(false);
            setUploadSuccess("Foto profil berhasil dihapus.");
        } catch (err: any) {
            console.error("confirmDeleteAvatar caught error:", err);
            setUploadError(err.message || "Terjadi kesalahan saat menghapus foto profil.");
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        const handleAvatarUpdate = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail !== undefined) {
                setFotoProfilUrl(customEvent.detail);
                setImageError(false);
            }
        };
        window.addEventListener('avatar-update', handleAvatarUpdate);
        return () => {
            window.removeEventListener('avatar-update', handleAvatarUpdate);
        };
    }, []);

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    window.location.href = '/login';
                    return;
                }
                setUserId(user.id);
                setEmail(user.email || '');

                const { data: profile } = await supabase
                    .from('profil_pengguna')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                console.log("PROFILE DATA:", profile)
                console.log("FOTO URL:", profile?.foto_profil_url)

                if (profile) {
                    setNamaLengkap(profile.nama_lengkap || '');
                    setNimNip(profile.nim_nip || '');
                    setKelas(profile.kelas || '');
                    setRole(profile.role || 'mahasiswa');
                    if (profile.foto_profil_url) {
                        setFotoProfilUrl(profile.foto_profil_url);
                        setImageError(false);
                    }

                    setOrigNama(profile.nama_lengkap || '');
                    setOrigNim(profile.nim_nip || '');
                    setOrigKelas(profile.kelas || '');
                } else {
                    // Profile not filled yet! Force onboarding redirection
                    router.push('/complete-profile');
                }
            } catch (err) {
                console.error('Gagal mengambil data profil:', err);
                setErrorMessage('Terjadi kesalahan memuat profil Anda.');
            } finally {
                setIsChecking(false);
            }
        };

        fetchUserProfile();
    }, [router]);

    const handleCancel = () => {
        setNamaLengkap(origNama);
        setNimNip(origNim);
        setKelas(origKelas);
        setIsEditing(false);
        setErrorMessage(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!namaLengkap.trim() || !nimNip.trim() || !kelas.trim()) {
            setErrorMessage('Seluruh kolom wajib diisi!');
            return;
        }

        if (!userId) return;

        setIsLoading(true);

        try {
            const { error } = await supabase
                .from('profil_pengguna')
                .update({
                    nama_lengkap: namaLengkap.trim(),
                    nim_nip: nimNip.trim(),
                    kelas: kelas.trim()
                })
                .eq('id', userId);

            if (error) {
                throw error;
            }

            setSuccessMessage('Perubahan profil berhasil disimpan!');
            setOrigNama(namaLengkap.trim());
            setOrigNim(nimNip.trim());
            setOrigKelas(kelas.trim());
            
            setTimeout(() => {
                setIsEditing(false);
                setSuccessMessage(null);
            }, 1000);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
                    <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat profil Anda...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] dark:text-neutral-300 font-sans pb-12 relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            {/* HEADER NAVBAR */}
            <Navbar 
                showBack 
                backUrl={role === 'admin' ? '/admin' : role === 'dosen' ? '/dosen' : '/'} 
                title={role === 'admin' ? 'Profil Admin' : role === 'dosen' ? 'Profil Dosen' : 'Profil Mahasiswa'} 
            />

            <main className="max-w-xl mx-auto px-4 py-12 relative z-10">
                <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F]/80 dark:border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-sm dark:shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                    {/* Profile Header Card */}
                    <div className="flex flex-col items-center text-center mb-8 border-b border-slate-100 dark:border-neutral-900 pb-6">
                        {uploadError && (
                            <div className="w-full mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm animate-in fade-in duration-200 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400">
                                <p className="font-medium leading-relaxed">{uploadError}</p>
                            </div>
                        )}
                        {uploadSuccess && (
                            <div className="w-full mb-6 flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-600 p-4 rounded-xl text-sm animate-in fade-in duration-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400">
                                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 dark:text-emerald-400" />
                                <p className="font-medium leading-relaxed">{uploadSuccess}</p>
                            </div>
                        )}

                        <div 
                            className="relative mb-4 group cursor-pointer select-none"
                            onClick={() => {
                                if (fotoProfilUrl && !imageError) {
                                    setIsViewModalOpen(true);
                                } else {
                                    fileInputRef.current?.click();
                                }
                            }}
                        >
                            {fotoProfilUrl && !imageError ? (
                                <div className="relative w-24 h-24 rounded-full overflow-hidden border border-slate-200 dark:border-neutral-800 shadow-lg shadow-cyan-500/10 transition-all duration-300">
                                    <img
                                        src={fotoProfilUrl}
                                        alt={origNama}
                                        onError={() => setImageError(true)}
                                        className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
                                    />
                                    {/* Subtle view icon overlay on hover */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <Eye className="w-5 h-5 text-white animate-in zoom-in-75 duration-200" />
                                    </div>
                                </div>
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-lg shadow-cyan-500/10 transition-all duration-300 group-hover:scale-105 select-none uppercase">
                                    {getInitials(origNama)}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                                className="absolute bottom-0 right-0 p-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-full shadow-md border border-white dark:border-[#0A0A0F] transition-all cursor-pointer z-10"
                                title="Ubah Foto Profil"
                            >
                                <Camera className="w-4 h-4" />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                onChange={handleFileChange}
                            />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{origNama}</h2>
                        <span className="mt-1 text-xs font-mono uppercase bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400 px-3 py-1 rounded-full">
                            {role}
                        </span>
                    </div>

                    {errorMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-600 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400 p-4 rounded-xl text-sm">
                            <p className="font-medium leading-relaxed">{errorMessage}</p>
                        </div>
                    )}
                    {successMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400 p-4 rounded-xl text-sm">
                            <p className="font-medium leading-relaxed">{successMessage}</p>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-2">Email Address</label>
                            <input
                                type="text"
                                value={email}
                                disabled
                                className="w-full bg-slate-100 border border-slate-200 dark:bg-neutral-950/50 dark:border-neutral-900/80 rounded-xl py-3 px-4 text-slate-500 dark:text-neutral-550 text-sm focus:outline-none cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Nama Lengkap</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={namaLengkap}
                                    onChange={(e) => setNamaLengkap(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <User className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">
                                {role === 'mahasiswa' ? 'Nomor Induk Mahasiswa (NIM)' : 'Nomor Induk Pegawai (NIP)'}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={nimNip}
                                    onChange={(e) => setNimNip(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <IdCard className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">
                                {role === 'mahasiswa' ? 'Kelas' : role === 'dosen' ? 'Inisial / Kode Dosen' : 'Departemen / Bagian'}
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={kelas}
                                    onChange={(e) => setKelas(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <GraduationCap className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-2">
                            {!isEditing ? (
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 text-sm tracking-widest cursor-pointer"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    <span>EDIT PROFIL</span>
                                </button>
                            ) : (
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="flex-1 flex items-center justify-center gap-2 border border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white py-3.5 px-4 rounded-xl transition-all text-sm font-bold cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                        <span>BATAL</span>
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest cursor-pointer"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        <span>SIMPAN</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </main>

            {/* CROP MODAL */}
            {isCropModalOpen && imageSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-[#0A0A0F]/95 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col relative">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-900">
                            <h3 className="text-base font-bold text-white tracking-wide">Ubah Foto Profil</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCropModalOpen(false);
                                    setImageSrc(null);
                                }}
                                className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Real-time preview */}
                        <div className="flex flex-col items-center py-6 bg-black/45 border-b border-neutral-900">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3">Pratinjau Foto Profil</span>
                            {croppedAreaPixels && imageDimensions ? (
                                <div className="w-[120px] h-[120px] rounded-full overflow-hidden border border-neutral-800 relative shadow-lg shadow-cyan-500/5">
                                    <img
                                        src={imageSrc}
                                        alt="Preview"
                                        style={{
                                            position: 'absolute',
                                            width: `${imageDimensions.width * (120 / croppedAreaPixels.width)}px`,
                                            height: `${imageDimensions.height * (120 / croppedAreaPixels.width)}px`,
                                            left: `${-croppedAreaPixels.x * (120 / croppedAreaPixels.width)}px`,
                                            top: `${-croppedAreaPixels.y * (120 / croppedAreaPixels.width)}px`,
                                        }}
                                        className="max-w-none"
                                    />
                                </div>
                            ) : (
                                <div className="w-[120px] h-[120px] rounded-full bg-neutral-900 border border-neutral-850 animate-pulse" />
                            )}
                        </div>

                        {/* Cropper area */}
                        <div className="relative h-72 bg-black">
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={onCropComplete}
                            />
                        </div>

                        {/* Zoom control slider */}
                        <div className="px-6 py-4 bg-[#0A0A0F] border-t border-neutral-900 flex items-center gap-4">
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Zoom</span>
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.1}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="flex-1 accent-cyan-500 bg-neutral-800 h-1 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Footer buttons */}
                        <div className="px-6 py-4 border-t border-neutral-900 flex justify-end gap-3 bg-[#0A0A0F]">
                            <button
                                type="button"
                                disabled={isUploading}
                                onClick={() => {
                                    setIsCropModalOpen(false);
                                    setImageSrc(null);
                                }}
                                className="px-4 py-2.5 bg-transparent border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white font-bold text-xs rounded-xl tracking-wider transition-all cursor-pointer disabled:opacity-50"
                            >
                                BATAL
                            </button>
                            <button
                                type="button"
                                disabled={isUploading}
                                onClick={handleSaveAvatar}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-extrabold text-xs rounded-xl tracking-wider transition-all duration-300 shadow-lg shadow-cyan-500/10 cursor-pointer disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>MENYIMPAN...</span>
                                    </>
                                ) : (
                                    <span>SIMPAN FOTO</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW PHOTO MODAL */}
            {isViewModalOpen && fotoProfilUrl && !imageError && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    {/* Close button top right */}
                    <button
                        type="button"
                        onClick={() => setIsViewModalOpen(false)}
                        className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-white/10 transition-all cursor-pointer"
                        title="Tutup"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <div className="flex flex-col items-center max-w-sm w-full relative animate-in zoom-in-95 duration-300">
                        {/* Centered Large Circular Image */}
                        <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-full overflow-hidden border-4 border-neutral-800 shadow-2xl relative mb-8">
                            <img
                                src={fotoProfilUrl}
                                alt={origNama}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        {/* Title / Name */}
                        <h4 className="text-lg font-bold text-white mb-2">{origNama}</h4>
                        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-6 font-mono">FOTO PROFIL</p>

                        {/* Action buttons below */}
                        <div className="flex gap-4 w-full">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsViewModalOpen(false);
                                    fileInputRef.current?.click();
                                }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl tracking-wider transition-all border border-white/10 hover:border-white/20 cursor-pointer"
                            >
                                <Camera className="w-4 h-4 text-cyan-400" />
                                <span>UBAH FOTO</span>
                            </button>
                            
                            <button
                                type="button"
                                onClick={handleDeleteAvatar}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 font-bold text-xs rounded-xl tracking-wider transition-all border border-red-900/50 hover:border-red-900/80 cursor-pointer"
                            >
                                <Trash2 className="w-4 h-4 text-red-500" />
                                <span>HAPUS FOTO</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM DELETE CONFIRMATION MODAL */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-xs bg-[#0A0A0F]/95 border border-red-500/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col relative p-6 text-center animate-in zoom-in-95 duration-200">
                        {/* Alert Icon */}
                        <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4">
                            <AlertTriangle className="w-6 h-6" />
                        </div>

                        {/* Title & Message */}
                        <h4 className="text-base font-bold text-white tracking-wide mb-2">Hapus Foto Profil?</h4>
                        <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                            Apakah Anda yakin ingin menghapus foto profil Anda? Tindakan ini tidak dapat dibatalkan.
                        </p>

                        {/* Action buttons */}
                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-2.5 bg-transparent border border-neutral-800 hover:border-neutral-700 text-neutral-450 hover:text-white font-bold text-xs rounded-xl tracking-wider transition-all cursor-pointer"
                            >
                                BATAL
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteAvatar}
                                className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-extrabold text-xs rounded-xl tracking-wider transition-all duration-300 shadow-lg shadow-red-500/10 cursor-pointer"
                            >
                                HAPUS
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
