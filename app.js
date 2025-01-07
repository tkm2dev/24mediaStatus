const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const moment = require("moment");
const cors = require("cors");
const app = express();

app.use(cors());
const PORT = 3000;

// URL หลักของ Directory Listing
const BASE_URL = "https://demuk.magicsigncloud.com/24media/logs_player/";

// ฟังก์ชันดึงรายชื่อโฟลเดอร์จาก Directory Listing
async function fetchFolders() {
  try {
    const response = await axios.get(BASE_URL);
    const html = response.data;
    const $ = cheerio.load(html);

    const folders = [];
    $("pre a").each((index, element) => {
      const link = $(element).attr("href");
      const text = $(element).text().trim();

      // กรองเฉพาะโฟลเดอร์ (ไม่รวม "To Parent Directory")
      if (link && text !== "[To Parent Directory]") {
        const folderName = text.replace("/", "");
        folders.push({
          name: folderName,
          url: `${BASE_URL}${folderName}/`, // สร้าง URL สำหรับแต่ละโฟลเดอร์
        });
      }
    });

    return folders;
  } catch (error) {
    console.error("Error fetching folders:", error.message);
    return [];
  }
}

// ฟังก์ชันตรวจสอบไฟล์ thumbnail.jpg ในโฟลเดอร์
async function checkThumbnailStatus(folder) {
  const thumbnailUrl = `${folder.url}thumbnail.jpg`;
  try {
    const response = await axios.head(thumbnailUrl);
    const lastModified = response.headers["last-modified"];

    if (lastModified) {
      const fileDate = moment(lastModified); // เวลาจากเซิร์ฟเวอร์ (GMT)
      const currentDate = moment();
      const diffInMinutes = currentDate.diff(fileDate, "minutes");

      // แปลง lastModified เป็น UTC+7
      const lastModifiedUTC7 = fileDate
        .utcOffset(7)
        .format("YYYY-MM-DD HH:mm:ss");

      // ถ้าช่วงเวลาล่าสุดไม่เกิน 5 นาที ถือว่าออนไลน์
      return {
        folder: folder.name,
        isOnline: diffInMinutes <= 5,
        lastModified: lastModifiedUTC7,
      };
    }
    return {
      folder: folder.name,
      isOnline: false,
      lastModified: null,
      error: "No Last-Modified header found.",
    };
  } catch (error) {
    // จัดการข้อผิดพลาด เช่น ไม่มีไฟล์ thumbnail.jpg
    return {
      folder: folder.name,
      isOnline: false,
      lastModified: null,
      error: error.message.includes("404")
        ? "File thumbnail.jpg not found."
        : error.message,
    };
  }
}

// ฟังก์ชันหลักสำหรับตรวจสอบสถานะทุกโฟลเดอร์
async function checkAllFolders() {
  const folders = await fetchFolders(); // ดึงรายชื่อโฟลเดอร์
  const results = await Promise.all(
    folders.map(async (folder) => await checkThumbnailStatus(folder)) // ตรวจสอบไฟล์ thumbnail.jpg ในแต่ละโฟลเดอร์
  );
  return results;
}

// สร้าง API เพื่อตรวจสอบสถานะ
// สร้าง API สำหรับแสดงทั้ง Online และ Offline
app.get("/api/status", async (req, res) => {
  try {
    const status = await checkAllFolders();
    const onlineFolders = status.filter((folder) => folder.isOnline);
    const offlineFolders = status.filter((folder) => !folder.isOnline);

    // เวลาปัจจุบันใน UTC+7
    const currentTime = moment().utcOffset(7).format("YYYY-MM-DD HH:mm:ss");

    res.json({
      success: true,
      message: "24 Media.",
      currentTime: currentTime, // เพิ่มเวลาปัจจุบันในเขตเวลา UTC+7
      data: {
        online: onlineFolders,
        offline: offlineFolders,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching folders status.",
      error: error.message,
    });
  }
});

// เริ่มต้นเซิร์ฟเวอร์
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
