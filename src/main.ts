// @ts-ignore
import { invoke } from "@tauri-apps/api/core";
import QRCode from 'qrcode';
import { jsPDF } from "jspdf";

const portDrop = document.getElementById("port-drop") as HTMLSelectElement;
const inputId = document.getElementById("input-id") as HTMLInputElement;
const inputUrl = document.getElementById("input-url") as HTMLInputElement;
const inputSize = document.getElementById("input-size") as HTMLInputElement;
const inputCustom = document.getElementById("input-custom") as HTMLInputElement;
const printRotationMode = document.getElementById("print-rotation-mode") as HTMLSelectElement;
const btnGenerate = document.getElementById("btn-generate") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnPrint = document.getElementById("btn-print") as HTMLButtonElement;
const btnGetId = document.getElementById("btn-get-id") as HTMLButtonElement;
const btnFlash = document.getElementById("btn-flash") as HTMLButtonElement;

const PAGE_WIDTH = 103; // Fixed 103mm width for the roll
const MARGIN_MM = 2;   // 2mm Top and Bottom margins
const MIN_QR_SIZE_MM = 1;
const MAX_QR_SIZE_MM = 80;
const DEFAULT_QR_SIZE_MM = 40;
const FONT_SIZE = 10;
const LINE_HEIGHT_MM = 4.2;

function getValidatedQrSizeMm(): number {
    const parsed = parseInt(inputSize.value, 10);
    const safeSize = Number.isFinite(parsed) ? parsed : DEFAULT_QR_SIZE_MM;
    const clamped = Math.min(MAX_QR_SIZE_MM, Math.max(MIN_QR_SIZE_MM, safeSize));
    inputSize.value = String(clamped);
    return clamped;
}

function buildPrintLayout() {
    const sizeMm = getValidatedQrSizeMm();
    const combinedText = inputUrl.value + inputId.value;
    const customText = inputCustom.value;

    const temp = new jsPDF({ unit: "mm" });
    temp.setFontSize(FONT_SIZE);
    // Keep text width aligned to QR width so it stays visually under the QR block.
    const textWidthMm = sizeMm;
    const lines1 = temp.splitTextToSize(combinedText, textWidthMm);
    const lines2 = temp.splitTextToSize(customText, textWidthMm);

    const totalTextLines = lines1.length + lines2.length;
    const totalTextHeight = totalTextLines * LINE_HEIGHT_MM;
    const pageHeightMm = MARGIN_MM + sizeMm + totalTextHeight + MARGIN_MM;

    return { sizeMm, combinedText, customText, lines1, lines2, pageHeightMm };
}

async function refreshPorts() {
    try {
        const ports: string[] = await invoke("get_serial_ports");
        if (ports.length > 0) {
            portDrop.innerHTML = ports.map(p => `<option value="${p}">${p}</option>`).join("");
        } else {
            portDrop.innerHTML = `<option value="">No Ports Detected</option>`;
        }
    } catch (e) { console.error(e); }
}
refreshPorts();

btnGetId.addEventListener("click", () => {
    if (portDrop.value) inputId.value = portDrop.value;
});

btnFlash.addEventListener("click", async () => {
    try {
        const res: string = await invoke("run_flash_command");
        alert("Status: " + res);
    } catch (e) { alert("Error: " + e); }
});

btnGenerate.addEventListener("click", async () => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    const { sizeMm, combinedText, customText } = buildPrintLayout();
    const sizePx = sizeMm * 3.78; 
    await QRCode.toCanvas(canvas, combinedText, { width: sizePx, margin: 0 });
    
    document.getElementById("text-output-1")!.textContent = combinedText;
    document.getElementById("text-output-2")!.textContent = customText;
    document.getElementById("preview-container")!.style.display = "block";
    btnSave.disabled = false;
    btnPrint.disabled = false;
});

async function createFinalCorrectPDF(): Promise<jsPDF> {
    const { sizeMm, lines1, lines2, pageHeightMm } = buildPrintLayout();
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    const imgData = canvas.toDataURL("image/png");

    // Let jsPDF orientation match geometry to avoid internal width/height swapping.
    const orientation = PAGE_WIDTH >= pageHeightMm ? "l" : "p";
    const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: [PAGE_WIDTH, pageHeightMm]
    });

    pdf.setFontSize(FONT_SIZE);
    const actualPageWidth = pdf.internal.pageSize.getWidth();
    const centerX = actualPageWidth / 2;
    const qrX = (actualPageWidth - sizeMm) / 2;

    // Center QR code horizontally, exactly 2mm from top
    pdf.addImage(imgData, 'PNG', qrX, MARGIN_MM, sizeMm, sizeMm);
    
    // Text blocks
    let currentY = MARGIN_MM + sizeMm + LINE_HEIGHT_MM;
    pdf.text(lines1, centerX, currentY, { align: "center" });

    currentY += (lines1.length * LINE_HEIGHT_MM);
    pdf.text(lines2, centerX, currentY, { align: "center" });

    return pdf;
}

inputSize.addEventListener("input", () => {
    const onlyDigits = inputSize.value.replace(/[^\d]/g, "");
    if (onlyDigits === "") return;
    const numeric = parseInt(onlyDigits, 10);
    const clamped = Math.min(MAX_QR_SIZE_MM, Math.max(MIN_QR_SIZE_MM, numeric));
    inputSize.value = String(clamped);
});

btnSave.addEventListener("click", async () => {
    const pdf = await createFinalCorrectPDF();
    pdf.save("qr-output.pdf");
});

btnPrint.addEventListener("click", async () => {
    try {
        btnPrint.textContent = "Printing...";
        const { pageHeightMm } = buildPrintLayout();
        const pdf = await createFinalCorrectPDF();
        const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
        await invoke("silent_print", {
            pdfData: Array.from(pdfBytes),
            pageHeightMm,
            printRotationMode: printRotationMode.value
        });
    } catch (err) { alert("Print Error: " + err); }
    finally { btnPrint.textContent = "Print"; }
});
