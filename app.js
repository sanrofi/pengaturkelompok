import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, push, get, child, remove 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDU1gaKy1FKc2guI8pNgBjNypRTlc9z8P8",
  authDomain: "pengatur-kelompok.firebaseapp.com",
  databaseURL: "https://pengatur-kelompok-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pengatur-kelompok",
  storageBucket: "pengatur-kelompok.firebasestorage.app",
  messagingSenderId: "8185428648",
  appId: "1:8185428648:web:f4c3a8d0cc7dd2f04ba09d"
};

const CLOUDINARY_CLOUD_NAME = "lk452fao";
const CLOUDINARY_UPLOAD_PRESET = "kerja_kelompok";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let masterSiswa = [];
let masterKelas = [];
let dataKelompokAktif = [];
let pemetaanManualTemp = {}; 
let exportDataCache = {}; 

const DRAFT_SESSION_KEY = "DRAFT_KELOMPOK_SESSION";

// ==========================================
// A. INISIALISASI HALAMAN
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    await muatDataKelas();
    await muatDataSiswa();
    renderDaftarKelasAdmin();
    renderDaftarKelasRekap();
    muatDraftSesi();
});

// ==========================================
// B. MODUL DATA KELAS & SISWA
// ==========================================

async function muatDataKelas() {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'classes'));
        masterKelas = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                masterKelas.push({ id: key, ...data[key] });
            });
        }

        // PERBAIKAN 1: Mencegah Duplikasi Nama Kelas dengan Normalisasi
        const uniqueClasses = [];
        const seenNames = new Set();

        masterKelas.forEach(k => {
            const cleanName = k.className.trim();
            if (!seenNames.has(cleanName.toLowerCase())) {
                seenNames.add(cleanName.toLowerCase());
                uniqueClasses.push({ id: k.id, className: cleanName });
            }
        });

        masterKelas = uniqueClasses;

        const selectKelompok = document.getElementById('select-kelas');
        selectKelompok.innerHTML = '<option value="">-- Pilih Kelas --</option>';

        masterKelas.forEach(k => {
            selectKelompok.innerHTML += `<option value="${k.className}">${k.className}</option>`;
        });
    } catch (e) {
        console.error("Gagal memuat kelas: ", e);
    }
}

async function simpanNamaKelasKeDB(namaKelas) {
    if (!namaKelas) return;
    const cleanName = namaKelas.trim();
    const sudahAda = masterKelas.some(k => k.className.toLowerCase() === cleanName.toLowerCase());
    if (!sudahAda) {
        const classesRef = ref(db, 'classes');
        const newClassRef = push(classesRef);
        await set(newClassRef, { className: cleanName });
    }
}

window.tambahKelas = async function() {
    const input = document.getElementById('input-nama-kelas');
    const namaKelas = input.value.trim();
    if (!namaKelas) return alert("Nama kelas tidak boleh kosong!");

    await simpanNamaKelasKeDB(namaKelas);
    alert("Kelas berhasil ditambahkan!");
    input.value = "";
    await muatDataKelas();
    renderDaftarKelasAdmin();
    renderDaftarKelasRekap();
}

// PERBAIKAN 2: Hapus Kelas beserta Seluruh Siswanya
window.hapusKelas = async function(namaKelas) {
    if (confirm(`Apakah Anda yakin ingin menghapus kelas "${namaKelas}" beserta seluruh data siswanya?`)) {
        try {
            // Hapus dari node 'classes'
            const kelasObj = masterKelas.filter(k => k.className.toLowerCase() === namaKelas.toLowerCase());
            for (const k of kelasObj) {
                await remove(ref(db, `classes/${k.id}`));
            }

            // Hapus siswa yang berada di kelas tersebut
            const siswaDiKelas = masterSiswa.filter(s => s.kelas.trim().toLowerCase() === namaKelas.toLowerCase());
            for (const s of siswaDiKelas) {
                await remove(ref(db, `students/${s.id}`));
            }

            alert(`Kelas ${namaKelas} dan siswanya berhasil dihapus.`);
            await muatDataKelas();
            await muatDataSiswa();
            renderDaftarKelasAdmin();
            renderDaftarKelasRekap();
        } catch (e) {
            console.error("Gagal menghapus kelas: ", e);
            alert("Gagal menghapus kelas.");
        }
    }
}

async function muatDataSiswa() {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'students'));
        masterSiswa = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                masterSiswa.push({ 
                    id: key, 
                    ...data[key],
                    kelas: data[key].kelas ? data[key].kelas.trim() : ""
                });
            });
        }
    } catch (e) {
        console.error("Gagal memuat siswa: ", e);
    }
}

// PERBAIKAN 2: Tampilan Accordion Daftar Kelas di Tab Admin
function renderDaftarKelasAdmin() {
    const container = document.getElementById('daftar-kelas-accordion');
    if (masterKelas.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-slate-400 border rounded-lg">Belum ada kelas terdaftar.</div>';
        return;
    }

    container.innerHTML = masterKelas.map(k => {
        const siswaKelas = masterSiswa.filter(s => s.kelas.toLowerCase() === k.className.toLowerCase());
        return `
            <div class="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div class="flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition cursor-pointer" onclick="toggleAccordion('admin-kelas-${k.id}')">
                    <div class="font-bold text-slate-700 flex items-center gap-2">
                        <span>📁 ${k.className}</span>
                        <span class="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">${siswaKelas.length} Siswa</span>
                    </div>
                    <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                        <button onclick="hapusKelas('${k.className}')" class="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-3 py-1 rounded font-bold">Hapus Kelas</button>
                    </div>
                </div>
                <div id="admin-kelas-${k.id}" class="hidden p-4 border-t border-slate-200">
                    ${siswaKelas.length === 0 ? '<p class="text-xs text-slate-400 italic">Belum ada siswa di kelas ini.</p>' : `
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs text-left border-collapse">
                                <thead class="bg-slate-100">
                                    <tr>
                                        <th class="p-2 border">NIS</th>
                                        <th class="p-2 border">Nama Siswa</th>
                                        <th class="p-2 border text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${siswaKelas.map(s => `
                                        <tr class="border-b hover:bg-slate-50">
                                            <td class="p-2 border">${s.nis}</td>
                                            <td class="p-2 border font-semibold">${s.nama}</td>
                                            <td class="p-2 border text-center">
                                                <button onclick="hapusSiswa('${s.id}')" class="text-red-600 hover:underline font-bold">Hapus</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

window.toggleAccordion = function(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.toggle('hidden');
}

window.hapusSiswa = async function(id) {
    if (confirm("Apakah Anda yakin ingin menghapus siswa ini?")) {
        try {
            await remove(ref(db, `students/${id}`));
            await muatDataSiswa();
            renderDaftarKelasAdmin();
            renderDaftarKelasRekap();
        } catch (e) {
            console.error("Gagal menghapus siswa: ", e);
        }
    }
}

// PERBAIKAN 1: Import Excel Tanpa Buat Kelas Duplikat
window.prosesImportExcel = function() {
    const fileInput = document.getElementById('file-excel');
    const file = fileInput.files[0];

    if (!file) return alert("Pilih berkas Excel/CSV terlebih dahulu!");

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            if (jsonData.length === 0) return alert("File Excel/CSV kosong!");

            let count = 0;
            const studentsRef = ref(db, 'students');

            for (const row of jsonData) {
                let nis = "", nama = "", kelas = "";

                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().toLowerCase();
                    if (cleanKey.includes("nis")) nis = String(row[key]).trim();
                    if (cleanKey.includes("nama")) nama = String(row[key]).trim();
                    if (cleanKey.includes("kelas")) kelas = String(row[key]).trim();
                });

                if (nis && nama && kelas) {
                    await simpanNamaKelasKeDB(kelas);
                    const newStudentRef = push(studentsRef);
                    await set(newStudentRef, { nis, nama, kelas });
                    count++;
                }
            }

            alert(`Berhasil mengimpor ${count} data siswa!`);
            fileInput.value = "";
            await muatDataKelas();
            await muatDataSiswa();
            renderDaftarKelasAdmin();
            renderDaftarKelasRekap();
        } catch (err) {
            console.error("Error import data: ", err);
            alert("Terjadi kesalahan saat memproses file.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// C. LOGIKA PEMBAGIAN KELOMPOK & DRAFT SESI
// ==========================================

window.loadSiswaByKelas = function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const boxPresensi = document.getElementById('box-presensi');
    const containerAbsen = document.getElementById('daftar-siswa-absen');
    document.getElementById('box-pemetaan-manual').classList.add('hidden');

    if (!kelasSelected) {
        boxPresensi.classList.add('hidden');
        return;
    }

    const siswaKelas = masterSiswa.filter(s => s.kelas.toLowerCase() === kelasSelected.toLowerCase());
    if (siswaKelas.length === 0) {
        alert("Tidak ada data siswa di kelas ini! Tambahkan siswa terlebih dahulu.");
        boxPresensi.classList.add('hidden');
        return;
    }

    containerAbsen.innerHTML = siswaKelas.map(s => `
        <label class="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer text-xs">
            <input type="checkbox" value="${s.id}" class="checkbox-absen w-4 h-4 text-indigo-600">
            <span class="truncate">${s.nama} (${s.nis})</span>
        </label>
    `).join('');

    boxPresensi.classList.remove('hidden');
}

window.prosesBagiKelompok = function(tipe) {
    const kelasSelected = document.getElementById('select-kelas').value;
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);

    if (!kelasSelected || totalKelompok < 1) return alert("Lengkapi pilihan kelas dan jumlah kelompok!");

    const checkedAbsen = Array.from(document.querySelectorAll('.checkbox-absen:checked')).map(cb => cb.value);
    const siswaHadir = masterSiswa.filter(s => s.kelas.toLowerCase() === kelasSelected.toLowerCase() && !checkedAbsen.includes(s.id));

    if (siswaHadir.length === 0) return alert("Semua siswa ditandai tidak hadir!");

    dataKelompokAktif = Array.from({ length: totalKelompok }, (_, i) => ({
        groupId: i + 1,
        members: [],
        photoUrl: "",
        score: 0
    }));

    if (tipe === 'acak') {
        const shuffled = [...siswaHadir];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        shuffled.forEach((siswa, index) => {
            const targetGroupIndex = index % totalKelompok;
            dataKelompokAktif[targetGroupIndex].members.push(siswa);
        });
    }

    document.getElementById('box-pemetaan-manual').classList.add('hidden');
    renderKartuKelompok();
    document.getElementById('box-hasil-kelompok').classList.remove('hidden');
    simpanDraftSesi();
}

window.tampilkanPemetaanManual = function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);

    if (!kelasSelected || totalKelompok < 1) return alert("Lengkapi pilihan kelas dan jumlah kelompok!");

    const checkedAbsen = Array.from(document.querySelectorAll('.checkbox-absen:checked')).map(cb => cb.value);
    const siswaHadir = masterSiswa.filter(s => s.kelas.toLowerCase() === kelasSelected.toLowerCase() && !checkedAbsen.includes(s.id));

    if (siswaHadir.length === 0) return alert("Semua siswa ditandai tidak hadir!");

    pemetaanManualTemp = {};
    siswaHadir.forEach(s => { pemetaanManualTemp[s.id] = 1; });

    const containerManual = document.getElementById('daftar-pemetaan-manual');
    containerManual.innerHTML = siswaHadir.map(s => {
        let radioOptions = '';
        for (let g = 1; g <= totalKelompok; g++) {
            radioOptions += `
                <label class="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border text-xs cursor-pointer hover:bg-slate-100">
                    <input type="radio" name="group_student_${s.id}" value="${g}" ${g === 1 ? 'checked' : ''} onchange="pilihKelompokSiswaManual('${s.id}', ${g})">
                    Kel ${g}
                </label>
            `;
        }

        return `
            <div class="flex flex-wrap items-center justify-between p-2 bg-white rounded border border-slate-200 gap-2">
                <span class="font-medium text-xs text-slate-700">${s.nama} (${s.nis})</span>
                <div class="flex gap-1 overflow-x-auto">${radioOptions}</div>
            </div>
        `;
    }).join('');

    updateNotifikasiKuotaKelompok(totalKelompok, siswaHadir.length);
    document.getElementById('box-pemetaan-manual').classList.remove('hidden');
}

window.pilihKelompokSiswaManual = function(studentId, groupId) {
    pemetaanManualTemp[studentId] = Number(groupId);
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);
    updateNotifikasiKuotaKelompok(totalKelompok, Object.keys(pemetaanManualTemp).length);
}

function updateNotifikasiKuotaKelompok(totalKelompok, totalSiswa) {
    const ringkasanBox = document.getElementById('ringkasan-kuota-kelompok');
    const counts = {};
    for (let i = 1; i <= totalKelompok; i++) counts[i] = 0;

    Object.values(pemetaanManualTemp).forEach(gid => {
        if (counts[gid] !== undefined) counts[gid]++;
    });

    ringkasanBox.innerHTML = Object.keys(counts).map(gid => `
        <span class="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-md border border-indigo-200">
            Kel ${gid}: <b>${counts[gid]}</b> org
        </span>
    `).join('');
}

window.prosesPemetaanManualSelesai = function() {
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);

    dataKelompokAktif = Array.from({ length: totalKelompok }, (_, i) => ({
        groupId: i + 1,
        members: [],
        photoUrl: "",
        score: 0
    }));

    Object.keys(pemetaanManualTemp).forEach(studentId => {
        const groupId = pemetaanManualTemp[studentId];
        const siswaObj = masterSiswa.find(s => s.id === studentId);
        if (siswaObj && groupId <= totalKelompok) {
            dataKelompokAktif[groupId - 1].members.push(siswaObj);
        }
    });

    document.getElementById('box-pemetaan-manual').classList.add('hidden');
    renderKartuKelompok();
    document.getElementById('box-hasil-kelompok').classList.remove('hidden');
    simpanDraftSesi();
}

function simpanDraftSesi() {
    const kelasSelected = document.getElementById('select-kelas').value;
    if (dataKelompokAktif.length === 0) return;

    const draftData = {
        kelas: kelasSelected,
        nomorSesi: document.getElementById('input-nomor-sesi').value || 1,
        jumlahKelompok: document.getElementById('jumlah-kelompok').value,
        dataKelompok: dataKelompokAktif
    };

    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(draftData));
}

function muatDraftSesi() {
    const savedDraft = localStorage.getItem(DRAFT_SESSION_KEY);
    if (!savedDraft) return;

    try {
        const draft = JSON.parse(savedDraft);
        if (draft && draft.dataKelompok && draft.dataKelompok.length > 0) {
            document.getElementById('select-kelas').value = draft.kelas || "";
            document.getElementById('input-nomor-sesi').value = draft.nomorSesi || 1;
            document.getElementById('jumlah-kelompok').value = draft.jumlahKelompok || 2;
            dataKelompokAktif = draft.dataKelompok;

            renderKartuKelompok();
            document.getElementById('box-hasil-kelompok').classList.remove('hidden');
        }
    } catch (e) {
        console.error("Gagal membaca draft sesi: ", e);
    }
}

function hapusDraftSesi() {
    localStorage.removeItem(DRAFT_SESSION_KEY);
}

function renderKartuKelompok() {
    const container = document.getElementById('kontainer-kartu-kelompok');

    container.innerHTML = dataKelompokAktif.map((g, idx) => `
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-md flex flex-col justify-between space-y-4">
            <div>
                <div class="flex justify-between items-center border-b pb-2 mb-3">
                    <h3 class="font-bold text-lg text-indigo-700">Kelompok ${g.groupId}</h3>
                    <span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full font-semibold">${g.members.length} Anggota</span>
                </div>

                <ul class="space-y-1 mb-4 text-sm text-slate-600 max-h-40 overflow-y-auto">
                    ${g.members.length > 0 
                        ? g.members.map(m => `<li class="flex justify-between"><span>• ${m.nama}</span> <span class="text-xs text-slate-400">(${m.nis})</span></li>`).join('') 
                        : '<li class="text-slate-400 italic">Belum ada anggota</li>'}
                </ul>
            </div>

            <div class="space-y-3 pt-3 border-t">
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Foto Kegiatan Live Kamera:</label>
                    <input type="file" accept="image/*" capture="environment" onchange="uploadFotoLive(this, ${idx})" class="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700">
                    ${g.photoUrl ? `<img src="${g.photoUrl}" class="mt-2 h-28 w-full object-cover rounded-lg border">` : ''}
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Nilai Kelompok (0-100):</label>
                    <input type="number" min="0" max="100" value="${g.score}" onchange="updateNilaiKelompok(${idx}, this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-center text-indigo-700">
                </div>
            </div>
        </div>
    `).join('');
}

window.uploadFotoLive = async function(inputElement, groupIndex) {
    const file = inputElement.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    try {
        inputElement.disabled = true;
        
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (data.secure_url) {
            dataKelompokAktif[groupIndex].photoUrl = data.secure_url;
            alert(`Foto Kelompok ${dataKelompokAktif[groupIndex].groupId} berhasil diunggah!`);
            renderKartuKelompok();
            simpanDraftSesi();
        } else {
            alert("Gagal mengunggah foto ke Cloudinary.");
        }
    } catch (err) {
        console.error(err);
        alert("Terjadi kesalahan saat unggah foto.");
    } finally {
        inputElement.disabled = false;
    }
}

window.updateNilaiKelompok = function(index, value) {
    dataKelompokAktif[index].score = Number(value);
    simpanDraftSesi();
}

// PERBAIKAN 4: Simpan Sesi Berdasarkan Sesi Input Manual Guru
window.simpanSeluruhSesi = async function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const nomorSesi = parseInt(document.getElementById('input-nomor-sesi').value) || 1;

    if (dataKelompokAktif.length === 0) return alert("Belum ada kelompok yang dibuat!");

    try {
        const payloadSesi = {
            kelas: kelasSelected,
            nomorSesi: nomorSesi,
            tanggal: new Date().toISOString(),
            groups: dataKelompokAktif
        };

        const sessionsRef = ref(db, 'group_sessions');
        const newSessionRef = push(sessionsRef);
        await set(newSessionRef, payloadSesi);

        alert(`Seluruh data Sesi Ke-${nomorSesi} berhasil disimpan!`);
        
        hapusDraftSesi();
        document.getElementById('box-hasil-kelompok').classList.add('hidden');
        dataKelompokAktif = [];
        
        renderDaftarKelasRekap();
    } catch (e) {
        console.error("Error simpan sesi: ", e);
        alert("Gagal menyimpan data ke Realtime Database.");
    }
}

// ==========================================
// D. REKAPITULASI NILAI PER KELAS (PERBAIKAN 3)
// ==========================================

async function renderDaftarKelasRekap() {
    const container = document.getElementById('daftar-kelas-rekap-accordion');
    
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'group_sessions'));
        let allSessions = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                allSessions.push({ id: key, ...data[key] });
            });
        }

        if (masterKelas.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 border rounded-lg">Belum ada kelas terdaftar.</div>';
            return;
        }

        container.innerHTML = masterKelas.map(k => {
            // Filter sesi & siswa untuk kelas ini
            const sesiKelas = allSessions.filter(s => s.kelas.toLowerCase() === k.className.toLowerCase());
            const siswaKelas = masterSiswa.filter(s => s.kelas.toLowerCase() === k.className.toLowerCase());

            // Dapatkan list nomor sesi unik
            const nomorSesiUnik = [...new Set(sesiKelas.map(s => s.nomorSesi || 1))].sort((a,b) => a - b);

            // Buat Cache untuk Download Excel per Kelas
            const exportData = [];

            let tbodyHTML = siswaKelas.map(s => {
                let totalSkor = 0;
                let jumlahSesiDiikuti = 0;
                let rowExport = { NIS: s.nis, Nama: s.nama, Kelas: k.className };

                let kolomSesiHTML = nomorSesiUnik.map(noSesi => {
                    let nilaiSiswa = "-";
                    // Cari sesi dengan nomorSesi ini
                    const sesiObj = sesiKelas.find(sk => (sk.nomorSesi || 1) === noSesi);

                    if (sesiObj && sesiObj.groups) {
                        sesiObj.groups.forEach(g => {
							// KODE BARU (Aman dan Presisi)
							if (g.members && g.members.length > 0) {
								const isMember = g.members.some(m => {
									// Cocokkan berdasarkan ID atau NIS (String & Number safe)
									if (m.id && s.id && String(m.id) === String(s.id)) return true;
									if (m.nis && s.nis && String(m.nis).trim() === String(s.nis).trim()) return true;
									return false;
								});

								if (isMember) {
									nilaiSiswa = Number(g.score) || 0;
									totalSkor += nilaiSiswa;
									jumlahSesiDiikuti++;
								}
							}
                        });
                    }

                    rowExport[`Sesi ${noSesi}`] = nilaiSiswa;
                    return `<td class="p-2 border text-center">${nilaiSiswa}</td>`;
                }).join('');

                const rataRata = jumlahSesiDiikuti > 0 ? (totalSkor / jumlahSesiDiikuti).toFixed(1) : "0.0";
                rowExport["Rata-Rata"] = parseFloat(rataRata);
                exportData.push(rowExport);

                return `
                    <tr class="border-b hover:bg-slate-50">
                        <td class="p-2 border">${s.nis}</td>
                        <td class="p-2 border font-semibold">${s.nama}</td>
                        ${kolomSesiHTML}
                        <td class="p-2 border text-center font-bold text-indigo-700 bg-indigo-50">${rataRata}</td>
                    </tr>
                `;
            }).join('');

            exportDataCache[k.className] = exportData;

            return `
                <div class="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <div class="flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition cursor-pointer" onclick="toggleAccordion('rekap-kelas-${k.id}')">
                        <div class="font-bold text-slate-700 flex items-center gap-2">
                            <span>📊 Kelas ${k.className}</span>
                            <span class="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">${siswaKelas.length} Siswa</span>
                        </div>
                        <div onclick="event.stopPropagation()">
                            <button onclick="downloadRekapExcelPerKelas('${k.className}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-xs">
                                📊 Unduh Excel
                            </button>
                        </div>
                    </div>
                    <div id="rekap-kelas-${k.id}" class="hidden p-4 border-t border-slate-200">
                        ${siswaKelas.length === 0 ? '<p class="text-xs text-slate-400 italic">Belum ada siswa di kelas ini.</p>' : `
                            <div class="overflow-x-auto">
                                <table class="w-full text-xs text-left border-collapse">
                                    <thead class="bg-indigo-50 text-indigo-900">
                                        <tr>
                                            <th class="p-2 border">NIS</th>
                                            <th class="p-2 border">Nama Siswa</th>
                                            ${nomorSesiUnik.map(n => `<th class="p-2 border text-center">Sesi ${n}</th>`).join('')}
                                            <th class="p-2 border text-center bg-indigo-100">Rata-Rata</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tbodyHTML}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error("Gagal merender rekap: ", e);
    }
}

window.downloadRekapExcelPerKelas = function(namaKelas) {
    const dataClass = exportDataCache[namaKelas];
    if (!dataClass || dataClass.length === 0) {
        return alert("Tidak ada data rekap untuk kelas ini!");
    }

    const fileName = `Rekap_Nilai_${namaKelas.replace(/\s+/g, '_')}.xlsx`;
    const worksheet = XLSX.utils.json_to_sheet(dataClass);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Nilai");

    XLSX.writeFile(workbook, fileName);
}