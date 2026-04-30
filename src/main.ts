// @ts-ignore
import { invoke } from "@tauri-apps/api/core";
import QRCode from 'qrcode';
import { jsPDF } from "jspdf";

const portDrop = document.getElementById("port-drop") as HTMLSelectElement;
const inputId = document.getElementById("input-id") as HTMLInputElement;
const inputUrl = document.getElementById("input-url") as HTMLInputElement;
const inputSize = document.getElementById("input-size") as HTMLInputElement;
const inputCustom = document.getElementById("input-custom") as HTMLInputElement;
const btnGenerate = document.getElementById("btn-generate") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnPrint = document.getElementById("btn-print") as HTMLButtonElement;
const btnGetId = document.getElementById("btn-get-id") as HTMLButtonElement;
const btnFlash = document.getElementById("btn-flash") as HTMLButtonElement;

const MARGIN_MM = 2;   // 2mm Top and Bottom margins
const MIN_QR_SIZE_MM = 1;
const MAX_QR_SIZE_MM = 80;
const DEFAULT_QR_SIZE_MM = 40;
const FONT_SIZE = 10;
const LINE_HEIGHT_MM = 4.2;
const QR_TEXT_GAP_MM = 2;

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
    const textWidthMm = sizeMm;
    const lines1 = temp.splitTextToSize(combinedText, textWidthMm);
    const lines2 = temp.splitTextToSize(customText, textWidthMm);

    const totalTextLines = lines1.length + lines2.length;
    const totalTextHeight = totalTextLines * LINE_HEIGHT_MM;
    const contentHeightMm = Math.max(sizeMm, totalTextHeight);
    const pageWidthMm = (MARGIN_MM * 2) + sizeMm + QR_TEXT_GAP_MM + textWidthMm;
    const pageHeightMm = (MARGIN_MM * 2) + contentHeightMm;

    return { sizeMm, combinedText, customText, lines1, lines2, textWidthMm, totalTextHeight, pageWidthMm, pageHeightMm };
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
    const { sizeMm, combinedText, customText, pageWidthMm } = buildPrintLayout();
    const sizePx = sizeMm * 3.78;
    await QRCode.toCanvas(canvas, combinedText, { width: sizePx, margin: 0 });

    const preview = document.getElementById("preview-container") as HTMLDivElement;
    preview.style.width = `${pageWidthMm}mm`;
    document.getElementById("text-output-1")!.textContent = combinedText;
    document.getElementById("text-output-2")!.textContent = customText;
    preview.style.display = "block";
    btnSave.disabled = false;
    btnPrint.disabled = false;
});

async function createFinalCorrectPDF(): Promise<{ pdf: jsPDF; pageWidthMm: number; pageHeightMm: number }> {
    const { sizeMm, combinedText, customText, pageWidthMm, pageHeightMm } = buildPrintLayout();
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    const imgData = canvas.toDataURL("image/png");

    const orientation = pageWidthMm > pageHeightMm ? "l" : "p";
    const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: [pageWidthMm, pageHeightMm]
    });

    pdf.setFontSize(FONT_SIZE);
    const actualPageWidth = pdf.internal.pageSize.getWidth();
    const actualPageHeight = pdf.internal.pageSize.getHeight();
    const contentHeightMm = actualPageHeight - (MARGIN_MM * 2);
    const qrX = MARGIN_MM;
    const qrY = MARGIN_MM + ((contentHeightMm - sizeMm) / 2);
    const textLeftX = qrX + sizeMm + QR_TEXT_GAP_MM;
    const textWidthMm = Math.max(8, actualPageWidth - textLeftX - MARGIN_MM);
    const textCenterX = textLeftX + (textWidthMm / 2);
    const lines1 = pdf.splitTextToSize(combinedText, textWidthMm);
    const lines2 = pdf.splitTextToSize(customText, textWidthMm);
    const totalTextHeight = (lines1.length + lines2.length) * LINE_HEIGHT_MM;
    const textStartY = MARGIN_MM + ((contentHeightMm - totalTextHeight) / 2) + LINE_HEIGHT_MM;

    // QR block on left
    pdf.addImage(imgData, 'PNG', qrX, qrY, sizeMm, sizeMm);

    // Text block on right
    pdf.text(lines1, textCenterX, textStartY, { align: "center" });
    const secondBlockY = textStartY + (lines1.length * LINE_HEIGHT_MM);
    pdf.text(lines2, textLeftX, secondBlockY, { align: "left" });

    return {
        pdf,
        pageWidthMm: actualPageWidth,
        pageHeightMm: actualPageHeight
    };
}

inputSize.addEventListener("input", () => {
    const onlyDigits = inputSize.value.replace(/[^\d]/g, "");
    if (onlyDigits === "") return;
    const numeric = parseInt(onlyDigits, 10);
    const clamped = Math.min(MAX_QR_SIZE_MM, Math.max(MIN_QR_SIZE_MM, numeric));
    inputSize.value = String(clamped);
});

btnSave.addEventListener("click", async () => {
    const { pdf } = await createFinalCorrectPDF();
    pdf.save("qr-output.pdf");
});

btnPrint.addEventListener("click", async () => {
    try {
        btnPrint.textContent = "Printing...";
        const { pdf, pageWidthMm, pageHeightMm } = await createFinalCorrectPDF();
        const pdfBytes = new Uint8Array(pdf.output('arraybuffer'));
        await invoke("silent_print", {
            pdfData: Array.from(pdfBytes),
            pageWidthMm,
            pageHeightMm,
            // Keep printer output identical to generated PDF by avoiding
            // orientation overrides at print time.
            printRotationMode: "auto"
        });
    } catch (err) { alert("Print Error: " + err); }
    finally { btnPrint.textContent = "Print"; }
});
