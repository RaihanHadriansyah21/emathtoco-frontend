const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log("Starting Puppeteer telemetry...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--enable-precise-memory-info'
        ]
    });
    const page = await browser.newPage();
    
    // Log console messages
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        const logEntry = `[CONSOLE] [${Date.now()}] ${msg.type().toUpperCase()}: ${text}`;
        consoleLogs.push(logEntry);
        console.log(logEntry);
    });
    
    // Log network requests
    const networkRequests = [];
    page.on('request', req => {
        const url = req.url();
        const method = req.method();
        networkRequests.push({ timestamp: Date.now(), url, method });
    });
    
    try {
        // Navigate to Mahasiswa Login page directly
        console.log("Navigating to mahasiswa login page directly...");
        await page.goto('http://localhost:3000/login/mahasiswa', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));
        
        // Fill credentials and login
        console.log("Entering credentials...");
        await page.type('input[type="email"]', 'mhs12@gmail.com');
        await page.type('input[type="password"]', 'password123');
        await new Promise(r => setTimeout(r, 1000));
        
        console.log("Submitting login form...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);
        
        console.log("Logged in, URL is now:", page.url());
        await new Promise(r => setTimeout(r, 5000));
        
        // Collect memory logs and wait 60s
        console.log("Sitting idle on dashboard for 60 seconds...");
        const memoryData = [];
        for (let i = 0; i <= 60; i += 15) {
            const heap = await page.evaluate(() => window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : 0);
            memoryData.push({ stage: 'dashboard', time: i, heap });
            console.log(`[HEAP] Dashboard idle ${i}s: ${heap} bytes`);
            if (i < 60) await new Promise(r => setTimeout(r, 15000));
        }
        
        // Navigate to profile
        console.log("Opening profile dropdown...");
        await page.click('header div.relative button');
        await new Promise(r => setTimeout(r, 1000));
        
        console.log("Clicking profile button...");
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('header div.relative button'));
            const profileBtn = buttons.find(btn => btn.textContent.trim().includes('Profile'));
            if (profileBtn) {
                profileBtn.click();
            } else {
                throw new Error("Profile button not found in dropdown");
            }
        });
        await new Promise(r => setTimeout(r, 5000));
        console.log("Currently at:", page.url());
        
        // Navigate back to dashboard
        console.log("Navigating back to dashboard...");
        await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 5000));
        
        // Navigate to student workspace
        console.log("Navigating to student workspace...");
        await page.goto('http://localhost:3000/matkul/c3d47192-85c6-4fb7-b9ca-edaa13a9954f', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 5000));
        console.log("Currently at:", page.url());
        
        // Workspace idle for 60 seconds
        console.log("Sitting idle on workspace for 60 seconds...");
        for (let i = 0; i <= 60; i += 15) {
            const heap = await page.evaluate(() => window.performance && window.performance.memory ? window.performance.memory.usedJSHeapSize : 0);
            memoryData.push({ stage: 'workspace', time: i, heap });
            console.log(`[HEAP] Workspace idle ${i}s: ${heap} bytes`);
            if (i < 60) await new Promise(r => setTimeout(r, 15000));
        }
        
        console.log("Writing telemetry outputs...");
        const outputDir = "C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\8ed1612e-087a-4daf-84d0-42b50923e143";
        fs.writeFileSync(path.join(outputDir, 'telemetry_console.log'), consoleLogs.join('\n'));
        fs.writeFileSync(path.join(outputDir, 'telemetry_network.json'), JSON.stringify(networkRequests, null, 2));
        fs.writeFileSync(path.join(outputDir, 'telemetry_memory.json'), JSON.stringify(memoryData, null, 2));
        console.log("Outputs written successfully!");
        
    } catch (e) {
        console.error("Telemetry failed with error:", e);
    } finally {
        console.log("Closing browser...");
        await browser.close();
    }
})();
