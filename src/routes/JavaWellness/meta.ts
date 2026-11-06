import express, { Request, Response } from 'express';


export const fetch = express.Router();


fetch.get('/masterSuggestionChatBot', (req, res) => {
    res.json({
        code: 100,
        message: 'Sukses',
        data: [
            // ---- Member ----
            {
                name: 'Booking Kelas', action: 'booking', role: 'member',
                examples: ['Mau booking kelas pilates besok', 'Booking yoga hari Sabtu']
            },
            {
                name: 'Jadwal Kelas', action: 'jadwal', role: 'member',
                examples: ['Jadwal kelas hari ini', 'Ada kelas apa minggu ini?']
            },
            {
                name: 'My Subscription', action: 'subscription', role: 'member',
                examples: ['Sisa kuota kelas saya', 'Paket saya berlaku sampai kapan?']
            },
            {
                name: 'Tentang Pilates', action: 'chat', role: 'member',
                value: 'Apa manfaat pilates untuk kesehatan tubuh dan pikiran?',
                examples: ['Bedanya pilates dan yoga', 'Pilates cocok untuk pemula?']
            },

        ]
    });
});

fetch.get('/metaChat', (req: Request, res: Response) => {
    res.status(200).json({
        code: 100,
        message: 'Sukses',
        data: {
            meta: {
                titleBar: 'JavaWellness Assistant',
                description: 'Asisten Virtual Java Pilates & Wellness',
                tagline: 'Wellness, Your Way',
                // {name} diganti app dengan nama member; kosong -> "Anda"
                welcomeMessage:
                    'Halo, {name}! ??\nSelamat datang di JavaWellness!\nAda yang bisa saya bantu hari ini?',
                chatUrl: 'https://wsip.yamaha-jatim.co.id:5000/api/chat/javayoga',
                chatMaster: 'https://wsip.yamaha-jatim.co.id:5000/javayoga/masterSuggestionChatBot',
                features: {
                    newChat: true,
                    quickSuggestions: true,
                    rememberLocalConversation: false, // app belum menyimpan chat ke HP
                    branchPicker: true,               // pilih studio saat booking/jadwal
                    scheduleLookup: true              // cek jadwal real-time 7 hari ke depan
                },
                limits: {
                    maxQuestionLength: 500,
                    maxLocalMessages: 50,
                    scheduleDaysAhead: 7
                },
                labels: {
                    inputPlaceholder: 'Tanyakan sesuatu...',
                    quickQuestionTitle: 'Pilih topik populer:',
                    newChatTitle: 'Mulai Chat Baru?',
                    newChatMessage: 'Percakapan yang sedang berjalan akan dihapus dan tidak bisa dikembalikan.',
                    newChatConfirm: 'Ya, Mulai Baru',
                    newChatCancel: 'Batal',
                    retry: 'Coba Lagi'
                }
            }
        }
    });
});


fetch.get('/metaHome', (req: Request, res: Response) => {
    res.status(200).json({
        code: 100,
        message: 'Sukses',
        data: {
            meta: {
                maintenance: {
                    enabled: false,
                    title: 'Sedang Pemeliharaan Sistem',
                    message: 'Aplikasi sedang dalam pemeliharaan. Silakan coba lagi beberapa saat lagi.',
                    endAt: null,
                    allowRoles: []
                },

                announcements: [
                    {
                        id: 'ANN-TEMPLATE',
                        enabled: false,                 // <- wajib true baru tampil
                        severity: 'info',               // info | warning | critical
                        display: 'banner',              // banner | dialog | both
                        dismissible: true,
                        showOnce: true,
                        title: '',
                        message: '',
                        startAt: null,
                        endAt: null,
                        target: { roles: ['member', 'guru'], branches: [] },
                        action: null
                    }
                ],

                emergencyButton: {
                    enabled: false,
                    label: 'Bantuan Darurat',
                    placement: 'header',              // header | fab
                    roles: ['member', 'guru'],
                    contacts: []
                }
            }
        }
    });
});

