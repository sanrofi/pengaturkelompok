// Import Modul Firebase Realtime Database SDK v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, push, get, child, remove 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. Konfigurasi Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyDU1gaKy1FKc2guI8pNgBjNypRTlc9z8P8",
  authDomain: "pengatur-kelompok.firebaseapp.com",
  databaseURL: "https://pengatur-kelompok-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pengatur-kelompok",
  storageBucket: "pengatur-kelompok.firebasestorage.app",
  messagingSenderId: "8185428648",
  appId: "1:8185428648:web:f4c3a8d0cc7dd2f04ba09d"
};

// Konfigurasi Cloudinary Anda
const CLOUDINARY_CLOUD_NAME = "lk452fao";
const CLOUDINARY_UPLOAD_PRESET = "kerja_kelompok";

// Inisialisasi Firebase & Realtime Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Variabel global penampung data
let masterSiswa = [];
let masterKelas = [];
let dataKelompokAktif = [];
let pemetaanManualTemp = {}; // { studentId: groupId }
let exportDataCache = []; // Penampung data untuk export Excel

// Key LocalStorage untuk Auto-Save Sesi Berjalan (POIN 2)
const DRAFT_SESSION_KEY = "DRAFT_KELOMPOK_SESSION";

// ==========================================
// A. LOGIKA UTAMA SAAT HALAMAN DIMUAT
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    await muatDataKelas();
    await muatDataSiswa();
    renderTabelSiswa();
    renderTabelRekap();
    muatDraftSesi(); // Pulihkan data jika halaman di-refresh
});


// ==========================================
// B. MODUL ADMIN & DATA SISWA
// ==========================================

// 1. Tambah Kelas Baru
window.tambahKelas = async function() {
    const input = document.getElementById('input-nama-kelas');
    const namaKelas = input.value.trim();
    if (!namaKelas) return alert("Nama kelas tidak boleh kosong!");

    await simpanNamaKelasKeDB(namaKelas);
    alert("Kelas berhasil ditambahkan!");
    input.value = "";
    await muatDataKelas();
}

// Fungsi bantu simpan kelas jika belum ada di database (POIN 1)
async function simpanNamaKelasKeDB(namaKelas) {
    if (!namaKelas) return;
    const sudahAda = masterKelas.some(k => k.className.toLowerCase() === namaKelas.toLowerCase());
    if (!sudahAda) {
        const classesRef = ref(db, 'classes');
        const newClassRef = push(classesRef);
        await set(newClassRef, { className: namaKelas });
    }
}

// 2. Load Data Kelas dari Realtime Database
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

        const selectKelompok = document.getElementById('select-kelas');
        const selectFilterRekap = document.getElementById('filter-kelas-rekap');

        selectKelompok.innerHTML = '<option value="">-- Pilih Kelas --</option>';
        selectFilterRekap.innerHTML = '<option value="">Semua Kelas</option>';

        masterKelas.forEach(k => {
            selectKelompok.innerHTML += `<option value="${k.className}">${k.className}</option>`;
            selectFilterRekap.innerHTML += `<option value="${k.className}">${k.className}</option>`;
        });
    } catch (e) {
        console.error("Gagal memuat kelas: ", e);
    }
}

// 3. Load Data Siswa dari Realtime Database
async function muatDataSiswa() {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'students'));
        masterSiswa = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                masterSiswa.push({ id: key, ...data[key] });
            });
        }
    } catch (e) {
        console.error("Gagal memuat siswa: ", e);
    }
}

// 4. Render Tabel Siswa
function renderTabelSiswa() {
    const tbody = document.getElementById('tabel-siswa-body');
    if (masterSiswa.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada data siswa.</td></tr>';
        return;
    }

    tbody.innerHTML = masterSiswa.map(s => `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-3 border">${s.nis}</td>
            <td class="p-3 border font-semibold">${s.nama}</td>
            <td class="p-3 border">${s.kelas}</td>
            <td class="p-3 border text-center">
                <button onclick="hapusSiswa('${s.id}')" class="text-red-600 hover:text-red-800 text-xs font-bold">Hapus</button>
            </td>
        </tr>
    `).join('');
}

// 5. Hapus Siswa
window.hapusSiswa = async function(id) {
    if (confirm("Apakah Anda yakin ingin menghapus siswa ini?")) {
        try {
            await remove(ref(db, `students/${id}`));
            await muatDataSiswa();
            renderTabelSiswa();
            renderTabelRekap();
        } catch (e) {
            console.error("Gagal menghapus siswa: ", e);
        }
    }
}

// 6. Import Data Excel / CSV (POIN 1: Otomatis Daftarkan Kelas Baru)
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
                    // Otomatis simpan kelas baru jika belum terdaftar ke database
                    await simpanNamaKelasKeDB(kelas);

                    const newStudentRef = push(studentsRef);
                    await set(newStudentRef, { nis, nama, kelas });
                    count++;
                }
            }

            if (count === 0) {
                alert("Gagal membaca data! Pastikan file memuat kolom: NIS, NAMA, dan KELAS.");
            } else {
                alert(`Berhasil mengimpor ${count} data siswa dan mendaftarkan kelasnya!`);
                fileInput.value = "";
                await muatDataKelas();
                await muatDataSiswa();
                renderTabelSiswa();
            }
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

// Load Siswa Berdasarkan Kelas
window.loadSiswaByKelas = function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const boxPresensi = document.getElementById('box-presensi');
    const containerAbsen = document.getElementById('daftar-siswa-absen');
    document.getElementById('box-pemetaan-manual').classList.add('hidden');

    if (!kelasSelected) {
        boxPresensi.classList.add('hidden');
        return;
    }

    const siswaKelas = masterSiswa.filter(s => s.kelas === kelasSelected);
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

// Algoritma Pengacak / Pembuat Kelompok Otomatis
window.prosesBagiKelompok = function(tipe) {
    const kelasSelected = document.getElementById('select-kelas').value;
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);

    if (!kelasSelected || totalKelompok < 1) return alert("Lengkapi pilihan kelas dan jumlah kelompok!");

    const checkedAbsen = Array.from(document.querySelectorAll('.checkbox-absen:checked')).map(cb => cb.value);
    const siswaHadir = masterSiswa.filter(s => s.kelas === kelasSelected && !checkedAbsen.includes(s.id));

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
    simpanDraftSesi(); // Simpan draft
}

// --- POIN 3: FITUR PEMETAAN KELOMPOK MANUAL DENGAN NOTIFIKASI JUMLAH ---
window.tampilkanPemetaanManual = function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);

    if (!kelasSelected || totalKelompok < 1) return alert("Lengkapi pilihan kelas dan jumlah kelompok!");

    const checkedAbsen = Array.from(document.querySelectorAll('.checkbox-absen:checked')).map(cb => cb.value);
    const siswaHadir = masterSiswa.filter(s => s.kelas === kelasSelected && !checkedAbsen.includes(s.id));

    if (siswaHadir.length === 0) return alert("Semua siswa ditandai tidak hadir!");

    pemetaanManualTemp = {};
    // Atur default siswa ke kelompok 1
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
                <div class="flex gap-1 overflow-x-auto">
                    ${radioOptions}
                </div>
            </div>
        `;
    }).join('');

    updateNotifikasiKuotaKelompok(totalKelompok, siswaHadir.length);
    document.getElementById('box-pemetaan-manual').classList.remove('hidden');
}

window.pilihKelompokSiswaManual = function(studentId, groupId) {
    pemetaanManualTemp[studentId] = Number(groupId);
    const totalKelompok = parseInt(document.getElementById('jumlah-kelompok').value);
    const totalSiswa = Object.keys(pemetaanManualTemp).length;
    updateNotifikasiKuotaKelompok(totalKelompok, totalSiswa);
}

// Update Notifikasi Jumlah Anggota Kelompok
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
    const kelasSelected = document.getElementById('select-kelas').value;

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
    simpanDraftSesi(); // Simpan draft
}


// --- POIN 2: SISTEM DRAFT SESI & AUTO SAVE (AGAR TIDAK HILANG SAAT REFRESH) ---
function simpanDraftSesi() {
    const kelasSelected = document.getElementById('select-kelas').value;
    if (dataKelompokAktif.length === 0) return;

    const draftData = {
        kelas: kelasSelected,
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


// Render Kartu Kelompok
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

// Upload Foto ke Cloudinary
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
            simpanDraftSesi(); // Auto save foto ke draft
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

// Update Nilai
window.updateNilaiKelompok = function(index, value) {
    dataKelompokAktif[index].score = Number(value);
    simpanDraftSesi(); // Auto save nilai ke draft
}

// Simpan Sesi Permanen ke Firebase (POIN 2)
window.simpanSeluruhSesi = async function() {
    const kelasSelected = document.getElementById('select-kelas').value;

    if (dataKelompokAktif.length === 0) return alert("Belum ada kelompok yang dibuat!");

    try {
        const payloadSesi = {
            kelas: kelasSelected,
            tanggal: new Date().toISOString(),
            groups: dataKelompokAktif
        };

        const sessionsRef = ref(db, 'group_sessions');
        const newSessionRef = push(sessionsRef);
        await set(newSessionRef, payloadSesi);

        alert("Seluruh data kelompok, foto, dan nilai berhasil disimpan secara permanen!");
        
        hapusDraftSesi(); // Hapus draft karena sesi sudah resmi berakhir
        document.getElementById('box-hasil-kelompok').classList.add('hidden');
        dataKelompokAktif = [];
        
        await renderTabelRekap();
    } catch (e) {
        console.error("Error simpan sesi: ", e);
        alert("Gagal menyimpan data ke Realtime Database.");
    }
}


// ==========================================
// D. REKAPITULASI & EXPORT EXCEL (POIN 4)
// ==========================================
async function renderTabelRekap() {
    const filterKelas = document.getElementById('filter-kelas-rekap').value;
    const thead = document.getElementById('tabel-rekap-head');
    const tbody = document.getElementById('tabel-rekap-body');

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

        // Urutkan sesi berdasarkan tanggal
        allSessions.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        // Filter sesi berdasarkan kelas jika dipilih
        if (filterKelas) {
            allSessions = allSessions.filter(s => s.kelas === filterKelas);
        }

        // Filter siswa
        let siswaFiltered = masterSiswa;
        if (filterKelas) {
            siswaFiltered = masterSiswa.filter(s => s.kelas === filterKelas);
        }

        // Buat Dynamic Header (NIS, Nama, Kelas, Sesi 1, Sesi 2, ..., Rata-Rata)
        let headerHTML = `
            <tr>
                <th class="p-3 border">NIS</th>
                <th class="p-3 border">Nama Siswa</th>
                <th class="p-3 border">Kelas</th>
        `;
        allSessions.forEach((s, idx) => {
            headerHTML += `<th class="p-3 border text-center">Sesi ${idx + 1}</th>`;
        });
        headerHTML += `<th class="p-3 border text-center bg-indigo-100">Rata-Rata</th></tr>`;
        thead.innerHTML = headerHTML;

        if (siswaFiltered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-slate-400">Tidak ada data rekap.</td></tr>';
            exportDataCache = [];
            return;
        }

        // Susun Data Baris & Export Cache
        exportDataCache = [];

        tbody.innerHTML = siswaFiltered.map(s => {
            let totalSkor = 0;
            let jumlahSesiDiikuti = 0;
            let rowExport = { NIS: s.nis, Nama: s.nama, Kelas: s.kelas };

            let kolomSesiHTML = allSessions.map((session, idx) => {
                let nilaiSiswa = "-";
                
                if (session.groups) {
                    session.groups.forEach(g => {
                        if (g.members && g.members.some(m => m.id === s.id)) {
                            nilaiSiswa = g.score || 0;
                            totalSkor += Number(nilaiSiswa);
                            jumlahSesiDiikuti++;
                        }
                    });
                }

                rowExport[`Sesi ${idx + 1}`] = nilaiSiswa;
                return `<td class="p-3 border text-center">${nilaiSiswa}</td>`;
            }).join('');

            const rataRata = jumlahSesiDiikuti > 0 ? (totalSkor / jumlahSesiDiikuti).toFixed(1) : "0.0";
            rowExport["Rata-Rata"] = parseFloat(rataRata);

            exportDataCache.push(rowExport);

            return `
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-3 border">${s.nis}</td>
                    <td class="p-3 border font-semibold">${s.nama}</td>
                    <td class="p-3 border">${s.kelas}</td>
                    ${kolomSesiHTML}
                    <td class="p-3 border text-center font-bold text-indigo-700 bg-indigo-50/50">${rataRata}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error("Gagal merender rekap: ", e);
    }
}

// POIN 4: Fungsi Unduh Rekap Excel / CSV
window.downloadRekapExcel = function() {
    if (exportDataCache.length === 0) {
        return alert("Tidak ada data rekap yang dapat diunduh!");
    }

    const kelasSelected = document.getElementById('filter-kelas-rekap').value || "Semua_Kelas";
    const fileName = `Rekap_Nilai_Kelompok_${kelasSelected}.xlsx`;

    const worksheet = XLSX.utils.json_to_sheet(exportDataCache);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Nilai");

    XLSX.writeFile(workbook, fileName);
}