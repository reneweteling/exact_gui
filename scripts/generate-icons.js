#!/usr/bin/env node

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Icon sizes needed for Tauri
const iconSizes = [
  { name: "32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 }, // Base icon for conversion to other formats
];

// Windows Store logo sizes
const storeLogoSizes = [
  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },
  { name: "StoreLogo.png", size: 50 },
];

const inputSvg = path.join(__dirname, "../public/logo.svg");
const outputDir = path.join(__dirname, "../src-tauri/icons");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcoFile(inputSvg, outputDir) {
  try {
    console.log("Generating ICO file...");

    // Windows ICO requires multiple sizes embedded in one file
    const icoSizes = [16, 24, 32, 48, 64, 128, 256];
    const icoPath = path.join(outputDir, "icon.ico");

    // Create a buffer to hold the ICO file data
    const iconBuffers = [];

    // Generate each size
    for (const size of icoSizes) {
      const buffer = await sharp(inputSvg)
        .resize(size, size)
        .png()
        .toBuffer();
      iconBuffers.push({ size, buffer });
    }

    // Create proper ICO file format
    // ICO file header: 6 bytes
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // Reserved (must be 0)
    header.writeUInt16LE(1, 2); // Type (1 = ICO)
    header.writeUInt16LE(icoSizes.length, 4); // Number of images

    // Image directory entries: 16 bytes each
    const directoryEntries = [];
    let offset = 6 + (16 * icoSizes.length); // Start after header and directory

    for (const icon of iconBuffers) {
      const entry = Buffer.alloc(16);
      entry.writeUInt8(icon.size === 256 ? 0 : icon.size, 0); // Width
      entry.writeUInt8(icon.size === 256 ? 0 : icon.size, 1); // Height
      entry.writeUInt8(0, 2); // Color palette
      entry.writeUInt8(0, 3); // Reserved
      entry.writeUInt16LE(1, 4); // Color planes
      entry.writeUInt16LE(32, 6); // Bits per pixel
      entry.writeUInt32LE(icon.buffer.length, 8); // Size of image data
      entry.writeUInt32LE(offset, 12); // Offset to image data
      
      directoryEntries.push(entry);
      offset += icon.buffer.length;
    }

    // Combine all parts
    const icoFile = Buffer.concat([
      header,
      ...directoryEntries,
      ...iconBuffers.map(icon => icon.buffer)
    ]);

    // Write the ICO file
    fs.writeFileSync(icoPath, icoFile);
    console.log("Generated icon.ico");

  } catch (error) {
    console.error("Error generating ICO file:", error);
    throw error;
  }
}

async function generateIcnsFile(inputSvg, outputDir) {
  try {
    console.log("Generating ICNS file...");

    // Create temporary iconset directory
    const iconsetDir = path.join(outputDir, "icon.iconset");
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true });
    }
    fs.mkdirSync(iconsetDir);

    // ICNS requires specific sizes and naming conventions
    const icnsSizes = [
      { name: "icon_16x16.png", size: 16 },
      { name: "icon_16x16@2x.png", size: 32 },
      { name: "icon_32x32.png", size: 32 },
      { name: "icon_32x32@2x.png", size: 64 },
      { name: "icon_128x128.png", size: 128 },
      { name: "icon_128x128@2x.png", size: 256 },
      { name: "icon_256x256.png", size: 256 },
      { name: "icon_256x256@2x.png", size: 512 },
      { name: "icon_512x512.png", size: 512 },
      { name: "icon_512x512@2x.png", size: 1024 },
    ];

    // Generate all required PNG sizes
    for (const icon of icnsSizes) {
      const outputPath = path.join(iconsetDir, icon.name);
      await sharp(inputSvg)
        .resize(icon.size, icon.size)
        .png()
        .toFile(outputPath);
    }

    // Convert iconset to ICNS using macOS iconutil
    const icnsPath = path.join(outputDir, "icon.icns");
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
        stdio: "pipe",
      });
      console.log("Generated icon.icns");
    } catch (error) {
      console.warn("Warning: Could not generate ICNS file using iconutil.");
      console.warn(
        "This might be because you're not on macOS or iconutil is not available."
      );
      console.warn(
        "The iconset folder has been created and can be manually converted."
      );
      console.warn("Run: iconutil -c icns icon.iconset -o icon.icns");
    }

    // Clean up iconset directory
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true });
    }
  } catch (error) {
    console.error("Error generating ICNS file:", error);
    throw error;
  }
}

async function generateIcons() {
  try {
    console.log("Generating icons from logo.svg...");

    // Generate basic PNG icons
    for (const icon of iconSizes) {
      const outputPath = path.join(outputDir, icon.name);
      await sharp(inputSvg)
        .resize(icon.size, icon.size)
        .png()
        .toFile(outputPath);
      console.log(`Generated ${icon.name} (${icon.size}x${icon.size})`);
    }

    // Generate Windows Store logos
    for (const logo of storeLogoSizes) {
      const outputPath = path.join(outputDir, logo.name);
      await sharp(inputSvg)
        .resize(logo.size, logo.size)
        .png()
        .toFile(outputPath);
      console.log(`Generated ${logo.name} (${logo.size}x${logo.size})`);
    }

    // Generate ICO file (Windows) - proper multi-size ICO format
    await generateIcoFile(inputSvg, outputDir);

    // Generate ICNS file (macOS)
    await generateIcnsFile(inputSvg, outputDir);

    console.log("\nIcon generation complete!");
  } catch (error) {
    console.error("Error generating icons:", error);
    process.exit(1);
  }
}

generateIcons();
