const puppeteer = require("puppeteer"); // puppeteer do symulowania przeglądarki
const axios = require("axios"); // axios do obsługi webhooków
const prompt = require("prompt-sync")(); // prompt-sync do pobierania danych od użytkownika
const fs = require("fs"); // fs do obsługi systemu plików

const pageUrl = "https://zs2ostrzeszow.edupage.org/substitution/";
const checkInterval = 3600000;
const webhookFile = "webhook.txt";
let webhook;

if (fs.existsSync(webhookFile)) {
  webhook = fs.readFileSync(webhookFile, "utf8").trim();
  console.log("Wczytano zapisany webhook:", webhook);
} else {
  webhook = prompt("Podaj webhook: ");
  fs.writeFileSync(webhookFile, webhook, "utf8");
  console.log("Webhook został zapisany do pliku.");
}

const schoolClass = prompt("Podaj klasę (Nazwa musi być dokładna): ");
const checkDay = parseInt(prompt("Podaj dzień na kiedy chcesz sprawdzić zastępstwa (0 - dzisiaj, 1 - jutro): "));
const webhookUrl = `${webhook}`;

async function checkForUpdates() {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForSelector("div.cell", { timeout: 5000 });

    const dateString = getFormattedDate(checkDay);
    const newSubstitution = await page.evaluate(
      (dateString) =>
        Array.from(document.querySelectorAll("div.cell")).some((el) =>
          el.textContent.includes(dateString)
        ),
      dateString
    );

    if (newSubstitution) {
      await simulateClickAndGetData(page, dateString);
    } else {
      await sendNotification("Brak nowych zastępstw.");
    }
    await browser.close();
  } catch (error) {
    console.error("blad", error);
  }
}

async function simulateClickAndGetData(page, dateString) {
  try {
    const result = await page.evaluate((dateString) => {
      const targetElement = Array.from(
        document.querySelectorAll("div.cell")
      ).find((el) => el.textContent.includes(dateString));
      if (targetElement) targetElement.click();
      return !!targetElement;
    }, dateString);

    if (result) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const substitutionsForClass = await page.evaluate(
        (schoolClass) =>
          Array.from(document.querySelectorAll(".section .header"))
            .filter((header) => header.textContent.includes(`${schoolClass}`))
            .map((header) =>
              Array.from(header.nextElementSibling.querySelectorAll(".row"))
                .map((row) => row.textContent.trim())
                .join("\n")
            )
            .join("\n\n"),
        schoolClass
      );

      const message = substitutionsForClass.trim()
        ? `Zastępstwa dla klasy ${schoolClass} na ${dateString}:\n${substitutionsForClass}`
        : `Brak zastępstw dla klasy ${schoolClass} na ${dateString}`;
      await sendNotification(message);
    } else {
      console.error(`nie znaleziono elementu z tekstem ${dateString}.`);
    }
  } catch (error) {
    console.error("blad", error);
  }
}

async function sendNotification(message) {
  try {
    await axios.post(webhookUrl, {
      content: message,
    });
    console.log("wiadomosc wyslana");
  } catch (error) {
    console.error("blad", error);
  }
}

function getFormattedDate(dayOffset = 0) {
  const today = new Date();
  today.setDate(today.getDate() + dayOffset);
  const day = today.getDate();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.`;
}

checkForUpdates();
setInterval(checkForUpdates, checkInterval);