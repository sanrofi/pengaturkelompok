import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, push, get, child, remove, update 
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Application State Variables
let currentUser = null; 
let masterSiswa = [];
let masterKelas = [];
let masterUsers = [];
let dataKelompokAktif = [];
let riwayatSesiKelasAktif = [];
let pemetaanManualTemp = {}; 
let exportDataCache = {}; 

const AUTH_KEY = "LOGGED_IN_USER_SESSION";
const DRAFT_SESSION_KEY = "DRAFT_KELOMPOK_SESSION";

// ==========================================
// A. AUTHENTICATION & SESSION MANAGEMENT
// ==========================================

window.addEventListener('DOMContentLoaded', async () => {
    await pastikanAdminDefault();
    cekSessionUser();
});

async function pastikanAdminDefault() {
    try {
        const snapshot = await get(child(ref(db), 'users'));
        if (!snapshot.exists()) {
            const adminRef = push(ref(db, 'users'));
            await set(adminRef, {
                nama: "Administrator Utama",
                username: "admin",
                password: "adminpassword",
                role: "admin"
            });
        }
    } catch (e) {
        console.error("Gagal verifikasi admin default: ", e);
    }
}

function cekSessionUser() {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
        currentUser = JSON.parse(saved);
        renderAppUI();
    } else {
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('view-app').classList.add('hidden');
    }
}

window.handleLogin = async function(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();

    try {
        const snapshot = await get(child(ref(db), 'users'));
        if (snapshot.exists()) {
            const users = snapshot.val();
            const foundKey = Object.keys(users).find(k => users[k].username === u && users[k].password === p);

            if (foundKey) {
                currentUser = { id: foundKey, ...users[foundKey] };
                localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
                document.getElementById('login-username').value = "";
                document.getElementById('login-password').value = "";
                renderAppUI();
                return;
            }
        }
        alert("Username atau Password salah!");
    } catch (e) {
        console.error("Login Error: ", e);
        alert("Terjadi kesalahan sistem saat login.");
    }
}

window.handleLogout = function() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(DRAFT_SESSION_KEY);
    currentUser = null;
    location.reload();
}

async function renderAppUI() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');

    document.getElementById('user-display-nama').innerText = currentUser.nama;
    document.getElementById('user-display-role').innerText = currentUser.role;

    if (currentUser.role === 'admin') {
        document.getElementById('btn-tab-users').classList.remove('hidden');
        await muatDataUsers();
    } else {
        document.getElementById('btn-tab-users').classList.add('hidden');
    }

    await muatDataKelas();
    await muatDataSiswa();
    renderDaftarKelasAdmin();
    renderDaftarKelasRekap();
    muatDraftSesi();
}

// ==========================================
// B. DATA KELAS & SISWA (ISOLATED PER USER)
// ==========================================

async function muatDataKelas() {
    try {
        const snapshot = await get(child(ref(db), 'classes'));
        masterKelas = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                // HANYA AMBIL KELAS MILIK USER AKTIF
                if (data[key].userId === currentUser.id) {
                    masterKelas.push({ id: key, ...data[key] });
                }
            });
        }

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
        await set(newClassRef, { 
            className: cleanName,
            userId: currentUser.id 
        });
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

window.hapusKelas = async function(namaKelas) {
    if (confirm(`Hapus kelas "${namaKelas}" beserta seluruh siswanya?`)) {
        try {
            const kelasObj = masterKelas.filter(k => k.className.toLowerCase() === namaKelas.toLowerCase());
            for (const k of kelasObj) {
                await remove(ref(db, `classes/${k.id}`));
            }

            const siswaDiKelas = masterSiswa.filter(s => s.kelas.trim().toLowerCase() === namaKelas.toLowerCase());
            for (const s of siswaDiKelas) {
                await remove(ref(db, `students/${s.id}`));
            }

            alert(`Kelas ${namaKelas} berhasil dihapus.`);
            await muatDataKelas();
            await muatDataSiswa();
            renderDaftarKelasAdmin();
            renderDaftarKelasRekap();
        } catch (e) {
            console.error("Gagal menghapus kelas: ", e);
        }
    }
}

async function muatDataSiswa() {
    try {
        const snapshot = await get(child(ref(db), 'students'));
        masterSiswa = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                if (data[key].userId === currentUser.id) {
                    masterSiswa.push({ 
                        id: key, 
                        ...data[key],
                        kelas: data[key].kelas ? data[key].kelas.trim() : ""
                    });
                }
            });
        }
    } catch (e) {
        console.error("Gagal memuat siswa: ", e);
    }
}

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
                        <span>🏫 ${k.className}</span>
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
                    await set(newStudentRef, { 
                        nis, 
                        nama, 
                        kelas,
                        userId: currentUser.id 
                    });
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
// C. LOGIKA PEMBAGIAN KELOMPOK & RIWAYAT SESI
// ==========================================

window.loadSiswaByKelas = async function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const boxPresensi = document.getElementById('box-presensi');
    const containerAbsen = document.getElementById('daftar-siswa-absen');
    const boxOpsiRiwayat = document.getElementById('box-opsi-riwayat-kelompok');
    
    document.getElementById('box-pemetaan-manual').classList.add('hidden');

    if (!kelasSelected) {
        boxPresensi.classList.add('hidden');
        boxOpsiRiwayat.classList.add('hidden');
        return;
    }

    const siswaKelas = masterSiswa.filter(s => s.kelas.toLowerCase() === kelasSelected.toLowerCase());
    if (siswaKelas.length === 0) {
        alert("Tidak ada data siswa di kelas ini! Tambahkan siswa terlebih dahulu.");
        boxPresensi.classList.add('hidden');
        boxOpsiRiwayat.classList.add('hidden');
        return;
    }

    containerAbsen.innerHTML = siswaKelas.map(s => `
        <label class="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer text-xs">
            <input type="checkbox" value="${s.id}" class="checkbox-absen w-4 h-4 text-indigo-600">
            <span class="truncate">${s.nama} (${s.nis})</span>
        </label>
    `).join('');

    boxPresensi.classList.remove('hidden');

    // Load Riwayat Pembagian Kelompok Sesi Sebelumnya
    await loadRiwayatSesi(kelasSelected);
}

async function loadRiwayatSesi(kelasSelected) {
    const selectRiwayat = document.getElementById('select-riwayat-sesi');
    const boxOpsiRiwayat = document.getElementById('box-opsi-riwayat-kelompok');
    
    selectRiwayat.innerHTML = '<option value="">-- Pilih Sesi Riwayat --</option>';
    riwayatSesiKelasAktif = [];

    try {
        const snapshot = await get(child(ref(db), 'group_sessions'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                const s = data[key];
                if (s.userId === currentUser.id && s.kelas.toLowerCase() === kelasSelected.toLowerCase()) {
                    riwayatSesiKelasAktif.push({ id: key, ...s });
                }
            });
        }

        if (riwayatSesiKelasAktif.length > 0) {
            riwayatSesiKelasAktif.sort((a,b) => (a.nomorSesi || 1) - (b.nomorSesi || 1));
            riwayatSesiKelasAktif.forEach(s => {
                selectRiwayat.innerHTML += `<option value="${s.id}">Sesi Ke-${s.nomorSesi} (${s.groups ? s.groups.length : 0} Kelompok)</option>`;
            });
            boxOpsiRiwayat.classList.remove('hidden');
        } else {
            boxOpsiRiwayat.classList.add('hidden');
        }
    } catch (e) {
        console.error("Gagal membaca riwayat sesi: ", e);
    }
}

window.gunakanRiwayatKelompok = function() {
    const selectedSesiId = document.getElementById('select-riwayat-sesi').value;
    if (!selectedSesiId) return alert("Pilih sesi riwayat terlebih dahulu!");

    const sesiObj = riwayatSesiKelasAktif.find(s => s.id === selectedSesiId);
    if (!sesiObj || !sesiObj.groups) return alert("Data kelompok pada sesi ini tidak valid.");

    // Salin struktur kelompok tanpa membawa nilai lama
    dataKelompokAktif = sesiObj.groups.map(g => ({
        groupId: g.groupId,
        members: g.members || [],
        score: 0
    }));

    document.getElementById('jumlah-kelompok').value = dataKelompokAktif.length;
    document.getElementById('box-pemetaan-manual').classList.add('hidden');
    renderKartuKelompok();
    document.getElementById('box-hasil-kelompok').classList.remove('hidden');
    simpanDraftSesi();
    alert(`Berhasil menerapkan pembagian kelompok dari Sesi Ke-${sesiObj.nomorSesi}!`);
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
        userId: currentUser.id,
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
        if (draft && draft.userId === currentUser.id && draft.dataKelompok && draft.dataKelompok.length > 0) {
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

                <ul class="space-y-1 mb-4 text-sm text-slate-600 max-h-48 overflow-y-auto">
                    ${g.members.length > 0 
                        ? g.members.map(m => `<li class="flex justify-between border-b border-slate-50 py-1"><span>• ${m.nama}</span> <span class="text-xs text-slate-400">(${m.nis})</span></li>`).join('') 
                        : '<li class="text-slate-400 italic">Belum ada anggota</li>'}
                </ul>
            </div>

            <div class="space-y-2 pt-3 border-t">
                <label class="block text-xs font-bold text-slate-700">Nilai Kelompok (0-100):</label>
                <input type="number" min="0" max="100" value="${g.score}" onchange="updateNilaiKelompok(${idx}, this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-center text-indigo-700 text-lg">
            </div>
        </div>
    `).join('');
}

window.updateNilaiKelompok = function(index, value) {
    dataKelompokAktif[index].score = Number(value);
    simpanDraftSesi();
}

window.simpanSeluruhSesi = async function() {
    const kelasSelected = document.getElementById('select-kelas').value;
    const nomorSesi = parseInt(document.getElementById('input-nomor-sesi').value) || 1;

    if (dataKelompokAktif.length === 0) return alert("Belum ada kelompok yang dibuat!");

    try {
        const payloadSesi = {
            userId: currentUser.id,
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
        
        await loadSiswaByKelas();
        renderDaftarKelasRekap();
    } catch (e) {
        console.error("Error simpan sesi: ", e);
        alert("Gagal menyimpan data ke Realtime Database.");
    }
}

// ==========================================
// D. REKAPITULASI NILAI PER KELAS
// ==========================================

async function renderDaftarKelasRekap() {
    const container = document.getElementById('daftar-kelas-rekap-accordion');
    
    try {
        const snapshot = await get(child(ref(db), 'group_sessions'));
        let allSessions = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                if (data[key].userId === currentUser.id) {
                    allSessions.push({ id: key, ...data[key] });
                }
            });
        }

        if (masterKelas.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 border rounded-lg">Belum ada kelas terdaftar.</div>';
            return;
        }

        container.innerHTML = masterKelas.map(k => {
            const sesiKelas = allSessions.filter(s => s.kelas.toLowerCase() === k.className.toLowerCase());
            const siswaKelas = masterSiswa.filter(s => s.kelas.toLowerCase() === k.className.toLowerCase());

            const nomorSesiUnik = [...new Set(sesiKelas.map(s => s.nomorSesi || 1))].sort((a,b) => a - b);
            const exportData = [];

            let tbodyHTML = siswaKelas.map(s => {
                let totalSkor = 0;
                let jumlahSesiDiikuti = 0;
                let rowExport = { NIS: s.nis, Nama: s.nama, Kelas: k.className };

                let kolomSesiHTML = nomorSesiUnik.map(noSesi => {
                    let nilaiSiswa = "-";
                    const sesiObj = sesiKelas.find(sk => (sk.nomorSesi || 1) === noSesi);

                    if (sesiObj && sesiObj.groups) {
                        sesiObj.groups.forEach(g => {
                            if (g.members && g.members.length > 0) {
                                const isMember = g.members.some(m => {
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
                                📥 Unduh Excel
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

// ==========================================
// E. PANEL ADMIN: MANAJEMEN USER (ADMIN ONLY)
// ==========================================

async function muatDataUsers() {
    try {
        const snapshot = await get(child(ref(db), 'users'));
        masterUsers = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            Object.keys(data).forEach(key => {
                masterUsers.push({ id: key, ...data[key] });
            });
        }
        renderTabelUsers();
    } catch (e) {
        console.error("Gagal memuat data users: ", e);
    }
}

function renderTabelUsers() {
    const container = document.getElementById('tabel-daftar-users');
    if (!container) return;

    if (masterUsers.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-slate-400">Belum ada user terdaftar.</td></tr>`;
        return;
    }

    container.innerHTML = masterUsers.map(u => `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-2 border font-bold">${u.nama}</td>
            <td class="p-2 border">${u.username}</td>
            <td class="p-2 border font-mono">${u.password}</td>
            <td class="p-2 border">
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'} capitalize">
                    ${u.role}
                </span>
            </td>
            <td class="p-2 border text-center space-x-2">
                <button onclick="editUser('${u.id}')" class="text-indigo-600 hover:underline font-bold">Edit</button>
                ${u.id === currentUser.id ? '' : `<button onclick="hapusUser('${u.id}')" class="text-red-600 hover:underline font-bold">Hapus</button>`}
            </td>
        </tr>
    `).join('');
}

window.handleSaveUser = async function(e) {
    e.preventDefault();
    const editId = document.getElementById('user-edit-id').value;
    const nama = document.getElementById('user-nama').value.trim();
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value.trim();
    const role = document.getElementById('user-role').value;

    const duplicate = masterUsers.some(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== editId);
    if (duplicate) return alert("Username tersebut sudah digunakan!");

    try {
        if (editId) {
            await update(ref(db, `users/${editId}`), { nama, username, password, role });
            alert("Data user berhasil diperbarui!");
        } else {
            const newUserRef = push(ref(db, 'users'));
            await set(newUserRef, { nama, username, password, role });
            alert("User baru berhasil ditambahkan!");
        }

        resetFormUser();
        await muatDataUsers();
    } catch (err) {
        console.error("Gagal menyimpan user: ", err);
        alert("Terjadi kesalahan saat menyimpan user.");
    }
}

window.editUser = function(id) {
    const u = masterUsers.find(item => item.id === id);
    if (!u) return;

    document.getElementById('form-user-title').innerText = "Edit Data User / Guru";
    document.getElementById('user-edit-id').value = u.id;
    document.getElementById('user-nama').value = u.nama;
    document.getElementById('user-username').value = u.username;
    document.getElementById('user-password').value = u.password;
    document.getElementById('user-role').value = u.role;
}

window.resetFormUser = function() {
    document.getElementById('form-user-title').innerText = "Tambah User / Guru Baru";
    document.getElementById('user-edit-id').value = "";
    document.getElementById('user-nama').value = "";
    document.getElementById('user-username').value = "";
    document.getElementById('user-password').value = "";
    document.getElementById('user-role').value = "user";
}

window.hapusUser = async function(id) {
    if (confirm("Apakah Anda yakin ingin menghapus user ini?")) {
        try {
            await remove(ref(db, `users/${id}`));
            alert("User berhasil dihapus.");
            await muatDataUsers();
        } catch (e) {
            console.error("Gagal menghapus user: ", e);
        }
    }
}