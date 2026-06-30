const fs = require('fs');
const path = require('path');

const cloudinaryUrls = [
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839051/Nila-Athu-Vanathu-Mela-MassTamilan.io_los6wb.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839050/Oru-Ganam-Oru-Yugamaga-MassTamilan.io_rkbjo4.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839049/Raja-Rajathi-Raja-MassTamilan.io_mbbuh7.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839047/Maniye-Manikuyile-MassTamilan.io_i7p7ex.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839045/Oororama-Aathu-Pakkam-MassTamilan.io_aenswy.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839044/Velli-Kizhamai-Thala-Muzhuki-MassTamilan.io_edaxub.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839043/Naarinil-Poo-Thoduthu-MassTamilan.io_npscuk.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839042/Aathadi-Paavada-Kaathada-MassTamilan.io_v2rdlr.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839040/Thulli-Ezhunthadu-Pattu-MassTamilan.io_r3ah1e.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839038/Thaniyaga-Paaduthu-Paaduthu-MassTamilan.io_hbnbu4.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839037/Indha-Maan-Undhan-MassTamilan.io_bm74vv.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839036/Manjolai-Kili-Irukku-MassTamilan.io_w9biux.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839035/Eduthu-Naan-Vidava-MassTamilan.io_oizmd3.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839033/Oru-Jeevan-Azhaithathu-MassTamilan.io_me83en.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839031/Yaaradi-Naan-Thedum-MassTamilan.io_s80jno.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839030/Mamarathu-Kuyilu-MassTamilan.io_ot4ndz.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839029/Potti-Kadaiyile-MassTamilan.io_xsizly.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839028/Maappillai-Maappillai-MassTamilan.io_ylqnl7.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839027/Nilave-Nee-Varavendum-MassTamilan.io_mpsv2q.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839025/Thuppakki-Kaiyil-Eduthu-MassTamilan.io_igizb8.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839024/Sorgame-Endralum-Athu-MassTamilan.io_ohbgkz.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839023/Saanpillai-Aanalum-MassTamilan.io_w4qy7n.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839022/Poomalaiye-Thol-Serava-MassTamilan.io_aft5wb.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839021/Enga-Ooru-Kadhala-Pathi-MassTamilan.io_l1s7xh.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839019/Vatti-Edutha-MassTamilan.io_h7zl3c.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839018/Megam-Karukkaiyile-MassTamilan.io_gcnw22.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839017/Adi-Aathadi-MassTamilan.io_voitly.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839016/Antha-Nilavathan-MassTamilan.io_ttugri.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839014/Nethu-Oruthara-Oruthara-MassTamilan.io_qycdtc.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839013/Kaadhal-Un-Leelaiyaa-MassTamilan.io_t1gjfm.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839012/Indira-Sundariye-MassTamilan.io_iqboxm.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839011/Kadhalaa-Kadhalaa-MassTamilan.io_cmhdxe.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839010/Chinna-Ponnu-Selai-MassTamilan.io_cobngq.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839009/Kadhal-Oviyam-MassTamilan.io_mtqy6b.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839005/Veetukku-Veetukku-Vasapadi-MassTamilan.io_ro2ocq.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839007/Ellorukkum-Nallavan-MassTamilan.io_obr7vj.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839004/Sevvarali-Thottathile-Unna-Nenachen-MassTamilan.io_fbjdtr.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839004/Siruvani-Thanni-Kudichi-MassTamilan.io_wdfhjo.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839001/Kadhal-Kasukuthaiya-MassTamilan.io_pzcjcw.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839002/Poojaiketha-Poovithu-MassTamilan.io_dda2bl.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839001/Kattu-Vazhi-Pora-Ponne-MassTamilan.io_jqqpwc.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782839000/Naan-Thedum-Sevvanthi-Poovithu-MassTamilan.io_or30qo.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782838999/Kalyana-Maalai-MassTamilan.io_icjigv.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782838999/Das-Das-Chinnappadas-MassTamilan.io_zu9xyt.mp3",
  "https://res.cloudinary.com/cmsm55x4/video/upload/v1782838999/Sir-Yaru-MassTamilan.io_jpt5hz.mp3"
];

const songsDir = path.join(__dirname, 'illayaraja hits');

// Sample albums to assign randomly but consistently based on track name
const albums = [
  { name: "Pudhu Pudhu Arthangal", year: "1989", category: "Classic Romances" },
  { name: "Nayakan", year: "1987", category: "Epic Dramas" },
  { name: "Karagattakaran", year: "1989", category: "Rural Folk Hits" },
  { name: "Agni Natchathiram", year: "1988", category: "Synthesizer Magic" },
  { name: "Mouna Ragam", year: "1986", category: "Melodious Love" },
  { name: "Payanangal Mudivathillai", year: "1982", category: "Retro Hits" }
];

const defaultCovers = [
  "/covers/cover1.svg",
  "/covers/cover2.svg",
  "/covers/cover3.svg",
  "/covers/cover4.svg",
  "/covers/cover5.svg",
  "/covers/cover6.svg"
];

fs.readdir(songsDir, (err, files) => {
  if (err) {
    console.error("Unable to scan songs directory:", err);
    process.exit(1);
  }

  const mp3Files = files.filter(f => f.endsWith('.mp3'));
  console.log(`Found ${mp3Files.length} MP3 files in 'illayaraja hits'.`);

  const songsList = [];

  mp3Files.forEach((file, index) => {
    // Attempt to match with Cloudinary URLs
    // Clean filename matches the part before Cloudinary's hash suffix
    // Local: Aathadi-Paavada-Kaathada-MassTamilan.io.mp3
    // Cloudinary: .../Aathadi-Paavada-Kaathada-MassTamilan.io_v2rdlr.mp3
    const matchBase = file.replace('.mp3', ''); // Aathadi-Paavada-Kaathada-MassTamilan.io
    
    let matchedUrl = "";
    for (const url of cloudinaryUrls) {
      const urlFileName = url.substring(url.lastIndexOf('/') + 1);
      // Remove the hash part (_v2rdlr.mp3)
      const cleanUrlFileName = urlFileName.replace(/_[a-zA-Z0-9]+\.mp3$/, '.mp3');
      if (cleanUrlFileName === file) {
        matchedUrl = url;
        break;
      }
    }

    if (!matchedUrl) {
      console.warn(`Warning: No Cloudinary URL found matching file: ${file}`);
    }

    // Clean title: "Aathadi-Paavada-Kaathada-MassTamilan.io" -> "Aathadi Paavada Kaathada"
    let cleanTitle = file
      .replace('-MassTamilan.io.mp3', '')
      .replace(/-/g, ' ');
    
    // Select album based on index module
    const albumInfo = albums[index % albums.length];
    const cover = defaultCovers[index % defaultCovers.length];

    songsList.push({
      id: `track-${index + 1}`,
      title: cleanTitle,
      artist: "Ilaiyaraaja",
      album: albumInfo.name,
      year: albumInfo.year,
      category: albumInfo.category,
      cover: cover,
      localPath: `/songs/${file}`,
      streamUrl: matchedUrl || `/songs/${file}`
    });
  });

  fs.writeFileSync(
    path.join(__dirname, 'songs.json'),
    JSON.stringify(songsList, null, 2),
    'utf-8'
  );
  console.log(`Successfully generated songs.json with ${songsList.length} tracks.`);
});
