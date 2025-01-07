const fs = require("fs");
const puppeteer = require("puppeteer");
const csvParser = require("csv-parser");
const { stringify } = require("csv-stringify/sync");

// Function to read CSV file
async function readCSV(filePath) {
  const data = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => data.push(row))
      .on("end", () => resolve(data))
      .on("error", (err) => reject(err));
  });
}

// Function to write updated data to CSV
async function writeCSV(filePath, data) {
  const csvContent = stringify(data, { header: true });
  fs.writeFileSync(filePath, csvContent, "utf-8");
}

// Helper function to add a delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract the desired number from the page content
async function extractNumberFromPage(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Get all text content from the page
    const pageContent = await page.evaluate(() => {
      return document.body.innerText || "";
    });

    // Normalize whitespace and log for debugging
    const normalizedContent = pageContent.replace(/\s+/g, " ");
    console.log(
      `Attempt ${attempt}: Page content (truncated): ${normalizedContent.slice(
        0,
        200
      )}...`
    );

    // Match the "associated members" pattern
    const match = normalizedContent.match(/(\d+)\s+associated member(s?)/i);
    if (match) {
      return match[1]; // Return the extracted number
    }

    console.log(
      `No 'associated members' count found on attempt ${attempt}. Retrying...`
    );
    await delay(2000); // Add delay before retrying
  }

  console.log(
    "WARNING: No 'associated members' text found after multiple attempts. Defaulting to 0."
  );
  return "0";
}

// Perform actions for each URL
async function performActions(browser, url) {
  const page = await browser.newPage();
  try {
    // Place window.blur() here to remove focus from the Puppeteer browser
    await page.evaluate(() => {
      window.blur();
    });

    // await page.goto('https://www.linkedin.com/login');
    // await page.type('#username', 'xxx', { delay: 100 });
    // await page.type('#password', 'xxx', { delay: 100 });
    // await page.click('button[type="submit"]');
    // await page.waitForNavigation();

    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log("Waiting for page to stabilize...");
    await delay(3000); // Delay to ensure the page has stabilized

    console.log("Extracting number...");
    const extractedNumber = await extractNumberFromPage(page);

    console.log(`Extracted number: ${extractedNumber}`);
    return extractedNumber;
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return "Error";
  } finally {
    // Ensure the tab is closed even if an error occurs
    await page.close();
  }
}

// Main script
(async () => {
  const inputFilePath = "entries.csv";
  const outputFilePath = "entries_updated.csv";

  console.log("Reading input CSV...");
  const entries = await readCSV(inputFilePath);

  const userDataDir = process.platform === 'win32' ? 
    'C:\\Users\\1\\AppData\\Local\\Google\\Chrome\\User Data' :
    '/Users/yashp/Library/Application Support/Google/Chrome/Default';

  const browser = await puppeteer.launch({
    headless: true, // Run visibly
    executablePath:
      process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: null,
    args: [
      `--user-data-dir=${userDataDir}`,
      '--headless=new', // Use the new headless mode to work with user profiles
      '--disable-gpu', // Optional: Disable GPU acceleration (helps in some cases)
      '--no-sandbox', // Optional: Helps resolve permission issues
    ],

    // defaultViewport: null, // Full-screen view
  });

  console.log("Starting automation...");
  for (const entry of entries) {
    if (entry.count?.trim()) {
      console.log(
        `Skipping ${entry.urls} because count already exists: ${entry.count}`
      );
      continue;
    }

    try {
      entry.count = await performActions(browser, entry.urls);

      console.log("Adding delay between entries...");
      await delay(5000); // Add delay between processing each URL
    } catch (error) {
      console.error(`Unexpected error processing URL ${entry.urls}:`, error);
      entry.count = "Error";
    }
  }

  await browser.close();

  console.log("Writing updated CSV...");
  await writeCSV(outputFilePath, entries);

  console.log("Automation complete. Data saved to entries_updated.csv.");
})();
