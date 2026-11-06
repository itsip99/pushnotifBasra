import express, { Request, Response } from 'express';


export const fetch = express.Router();


fetch.get('/iconHIRS', (req, res) => {
  // Assuming you have an image stored locally with the name "image.jpg"
  // You can send the image as a response using res.sendFile()
  res.sendFile(__dirname + '/1.png');
});


fetch.get('/masterSuggestionChatBot', (req, res) => {

  res.json({
    'code': 100,
    'message': 'Sukses',
    'data': [
      {
        "name": "Sisa Cuti Saya",
        "examples": []
      },
      {
        "name": "Lihat Summary Saya",
        "examples": [
          "Jumlah keterlambatan",
          "Jumlah izin",
          "Jumlah cuti",
        ]
      },
      {
        "name": "Internal Memo HR/GA",
        "examples": [
          "Internal cuti",
          "Internal Perdin",
          "Dan lainnya"
        ]
      }

    ]
  });
});

fetch.get('/metaChat', (req: Request, res: Response) => {
  res.status(200).json({
    code: 100,
    message: 'Sukses',
    data: {
      meta: {
        titleBar: 'HRISA',
        description: 'Asisten Virtual HRISA',
        welcomeMessage:
          'Halo! Saya HRISA. Ada yang bisa saya bantu terkait kehadiran, cuti, pengajuan, atau fitur HRIS?',
        chatUrl: 'https://wsip.yamaha-jatim.co.id:5000/api/chat/HRIS',
        chatMaster: 'http://203.201.175.81:5000/HRIS/masterSuggestionChatBot',
        features: {
          newChat: true,
          quickSuggestions: true,
          rememberLocalConversation: true
        },

        limits: {
          maxQuestionLength: 500,
          maxLocalMessages: 50
        },

        labels: {
          inputPlaceholder: 'Tulis pertanyaan Anda...',
          quickQuestionTitle: 'Pertanyaan cepat',
          newChatTitle: 'Mulai percakapan baru?',
          newChatMessage:
            'Percakapan yang tampil saat ini akan dibersihkan.',
          newChatConfirm: 'Mulai baru',
          newChatCancel: 'Batal'
        }
      }
    }
  });
});


fetch.post('/metaHome', (req: Request, res: Response) => {
  const nik = req.body?.NIK;
  const pt = req.body?.PT;

  if (
    typeof nik !== 'string' || !nik.trim() ||
    typeof pt !== 'string' || !pt.trim()
  ) {
    return res.json({
      code: 200,
      message: 'NIK dan PT wajib diisi',
      data: { showDialog: true }
    });
  }

  const disableForAll = false;

  // Filter berdasarkan NIK
  const disabledNiks: string[] = [
    '2309/504253',
    '1902/502863', // jose
    '2205/503764', // colis
    '2201/503636', // daniel
  ];

  // Filter berdasarkan PT
  const disabledPTs: string[] = [

  ];

  const isDisabled =
    disableForAll ||
    disabledNiks.includes(nik.trim()) ||
    disabledPTs.includes(pt.trim().toUpperCase());





  return res.json({
    code: 100,
    message: 'Sukses',
    data: {
      showDialog: !isDisabled,
    }
  });
});


fetch.get('/metaCuti', (req: Request, res: Response) => {


  const nik = req.body?.NIK;
  const pt = req.body?.PT;

  if (
    typeof nik !== 'string' || !nik.trim() ||
    typeof pt !== 'string' || !pt.trim()
  ) {
    return res.json({
      code: 200,
      message: 'NIK dan PT wajib diisi',
      data: { showDialog: true }
    });
  }


  const disableForAll = false;

  // Filter berdasarkan NIK
  const disabledNiks: string[] = [
    '2309/504253',
  ];

  // Filter berdasarkan PT
  const disabledPTs: string[] = [

  ];

  const isDisabled =
    disableForAll ||
    disabledNiks.includes(nik.trim()) ||
    disabledPTs.includes(pt.trim().toUpperCase());



  return res.json({
    code: 100,
    message: 'Sukses',
    data: {
      q: isDisabled ? 12 : 12,
      Qdeadline: isDisabled ? 0 : 3, // hari
      'deskripsi': 'Upload lampiran dapat menyusul setelah pengajuan ini\ndibuat, lewat tombol "Isi Lampiran" di halaman Riwayat Cuti.',
      'memo': 'Batas waktu upload: 3 hari setelah pengajuan ini dibuat.'
    }
  });
});
