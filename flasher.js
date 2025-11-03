document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener("dragover", (event) => {
        if (!event.target.closest('.custom-file-upload')) return;
        event.preventDefault();
    }, false);

    window.addEventListener("drop", (event) => {
        if (!event.target.closest('.custom-file-upload')) event.preventDefault();
    }, false);

    const checkEsptoolLoaded = () => {
        if (window.esptoolJS) {
            initializeFlasher();
        } else {
            setTimeout(checkEsptoolLoaded, 100);
        }
    };
    checkEsptoolLoaded();

    function initializeFlasher() {
        function getElementById(id) {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`!!! Element with ID '${id}' not found in the DOM !!!`);
            }
            return element;
        }

        // --- Const Declarations ---
        const stepContainers = document.querySelectorAll('.step-container');
        const stepCircles = document.querySelectorAll('.stepper-circle');
        const nextToStep2Button = getElementById('nextToStep2');
        const backToStep1Button = getElementById('backToStep1');
        const nextToStep3Button = getElementById('nextToStep3');
        const backToStep2Button = getElementById('backToStep2');
        const startOverButton = getElementById('startOver');
        const connectButton = getElementById('connectButton');
        const resetButton = getElementById('resetButton');
        const disconnectButton = getElementById('disconnectButton');
        const flashButton = getElementById('flashButton');
        const eraseButton = getElementById('eraseButton');
        const terminalElem = getElementById('terminal');
        const chipInfoElem = getElementById('chipInfo');
        const flashProgressElem = getElementById('flashProgress');
        const flashSummaryElem = getElementById('flashSummary');
        const flashETAElem = getElementById('flashETA');
        const globalStatusIndicator = getElementById('globalStatusIndicator');
        const binaryTypeButtons = document.querySelectorAll('.binary-type-toggle .btn');
        const appFirmwareSection = getElementById('appFirmware');
        const bootloaderFirmwareSection = getElementById('bootloaderFirmware');
        const partitionFirmwareSection = getElementById('partitionFirmware');
        const flashModeSelect = getElementById('flashMode');
        const flashFreqSelect = getElementById('flashFreq');
        const flashSizeSelect = getElementById('flashSize');
        const appFileInput = getElementById('appFile');
        const bootloaderFileInput = getElementById('bootloaderFile');
        const partitionFileInput = getElementById('partitionFile');
        const appFileInfoElem = getElementById('appFileInfo');
        const bootloaderFileInfoElem = getElementById('bootloaderFileInfo');
        const partitionFileInfoElem = getElementById('partitionFileInfo');
        const appAddressInput = getElementById('appAddress');
        const bootloaderAddressInput = getElementById('bootloaderAddress');
        const partitionAddressInput = getElementById('partitionAddress');
        const gbDownloadSection = getElementById('gbDownloadSection');
        const manualUploadSection = getElementById('manualUploadSection');
        const choiceDownloadCard = getElementById('choiceDownload');
        const choiceManualCard = getElementById('choiceManual');
        const downloadOptionsContainer = getElementById('downloadOptionsContainer');
        const manualUploadContainer = getElementById('manualUploadContainer');
        const gbStatusElem = getElementById('ghostEspStatus');

        // --- Let Declarations (Moved Up) ---
        let espLoader = null;
        let transport = null;
        let connected = false;
        let chipType = '';
        let currentStep = 1;
        let extractedGbFiles = null;
        let selectedFirmwareMethod = null; // To track 'download' or 'manual'

        // --- Initial UI State ---
        if (appFileInfoElem) appFileInfoElem.textContent = 'No file selected';
        if (bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'No file selected';
        if (partitionFileInfoElem) partitionFileInfoElem.textContent = 'No file selected';

        // --- Terminal Object ---
        let espLoaderTerminal = {
            clean() {
                if (terminalElem) terminalElem.innerHTML = '';
            },
            writeLine(data) {
                if (terminalElem) {
                    terminalElem.innerHTML += data + '\n';
                    terminalElem.scrollTop = terminalElem.scrollHeight;
                }
                // updateStatusIndicator('flashing', 'Processing', data); // Maybe too noisy?
                console.log(data);
            },
            write(data) {
                if (terminalElem) {
                    terminalElem.innerHTML += data;
                    terminalElem.scrollTop = terminalElem.scrollHeight;
                }
                console.log(data);
            }
        };

        // --- Event Listeners ---
        nextToStep2Button.addEventListener('click', () => {
            if (connected) {
                goToStep(2);
            } else {
                espLoaderTerminal.writeLine("Please connect to a device first");
            }
        });

        backToStep1Button.addEventListener('click', () => goToStep(1));
        nextToStep3Button.addEventListener('click', () => {
            updateFlashSummary();
            goToStep(3);
        });
        backToStep2Button.addEventListener('click', () => goToStep(2));
        startOverButton.addEventListener('click', () => {
            clearExtractedData(); // Clear loaded ZIP data
            clearManualInputs(); // Also clear manual inputs
            if (connected) {
                disconnect().then(() => goToStep(1));
            } else {
                goToStep(1);
            }
        });

        if (binaryTypeButtons && binaryTypeButtons.length > 0) {
            binaryTypeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    binaryTypeButtons.forEach(btn => btn.classList.remove('active'));
                    if (appFirmwareSection) appFirmwareSection.classList.add('d-none');
                    if (bootloaderFirmwareSection) bootloaderFirmwareSection.classList.add('d-none');
                    if (partitionFirmwareSection) partitionFirmwareSection.classList.add('d-none');
                    button.classList.add('active');
                    const binaryType = button.dataset.binary;
                    if (binaryType === 'app' && appFirmwareSection) {
                        appFirmwareSection.classList.remove('d-none');
                    } else if (binaryType === 'bootloader' && bootloaderFirmwareSection) {
                        bootloaderFirmwareSection.classList.remove('d-none');
                    } else if (binaryType === 'partition' && partitionFirmwareSection) {
                        partitionFirmwareSection.classList.remove('d-none');
                    }
                });
            });
        }

        connectButton.addEventListener('click', connect);
        resetButton.addEventListener('click', resetDevice);
        disconnectButton.addEventListener('click', disconnect);
        flashButton.addEventListener('click', flash);
        eraseButton.addEventListener('click', eraseFlash);

        if (appFirmwareSection) {
            const appDropZone = appFirmwareSection.querySelector('.custom-file-upload');
            setupFileInputHandling(appDropZone, appFileInput, appFileInfoElem);
        }
        if (bootloaderFirmwareSection) {
            const bootloaderDropZone = bootloaderFirmwareSection.querySelector('.custom-file-upload');
            setupFileInputHandling(bootloaderDropZone, bootloaderFileInput, bootloaderFileInfoElem);
        }
        if (partitionFirmwareSection) {
            const partitionDropZone = partitionFirmwareSection.querySelector('.custom-file-upload');
            setupFileInputHandling(partitionDropZone, partitionFileInput, partitionFileInfoElem);
        }

        function setupFileInputHandling(dropZone, fileInput, infoElement) {
            if (!dropZone || !fileInput || !infoElement) {
                console.error("Missing elements for file input handling:", fileInput?.id);
                return;
            }
            const updateDisplay = (file) => {
                const fileSizeKB = Math.round(file.size / 1024);
                infoElement.textContent = `${file.name} (${fileSizeKB} KB)`;
                const uploadLabel = dropZone.querySelector('span');
                if (uploadLabel) {
                    uploadLabel.innerHTML = `<i class="bi bi-file-earmark-check"></i> ${file.name}`;
                }
                dropZone.classList.add('file-uploaded');
                updateBinaryTypeIndicators();
                updateButtonStates();
            };
            fileInput.onchange = function() {
                if (this.files && this.files.length > 0) {
                    updateDisplay(this.files[0]);
                } else {
                    infoElement.textContent = 'No file selected';
                    const uploadLabel = dropZone.querySelector('span');
                    if (uploadLabel) {
                        uploadLabel.innerHTML = `<i class="bi bi-upload"></i> Upload ${fileInput.id.replace('File', '')} Binary`;
                    }
                    dropZone.classList.remove('file-uploaded');
                    updateBinaryTypeIndicators();
                    updateButtonStates();
                }
            };
            dropZone.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.target !== fileInput) {
                    fileInput.click();
                }
            };
            dropZone.addEventListener('dragover', (event) => {
                event.stopPropagation();
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', (event) => {
                event.stopPropagation();
                event.preventDefault();
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-over');
                const files = e.dataTransfer?.files;
                if (!files?.length) return;
                const file = files[0];
                if (!file.name.toLowerCase().endsWith('.bin')) {
                    espLoaderTerminal.writeLine('⚠️ Only .bin files accepted');
                    return;
                }
                try { fileInput.files = files; } catch (_) {}
                const changeEvent = new Event('change');
                fileInput.dispatchEvent(changeEvent);
            });
            if (window[fileInput.id + '_debug']) {
                delete window[fileInput.id + '_debug'];
            }
            window[fileInput.id + '_debug'] = function() {};
            console.log("File input handling (including drag/drop) setup COMPLETE for", fileInput.id);
        }

        function goToStep(step) {
            stepContainers.forEach(container => container.classList.remove('active'));
            stepCircles.forEach(circle => {
                circle.classList.remove('active');
                circle.classList.remove('completed');
            });
            const targetStepContainer = document.getElementById(`step${step}`);
            if (targetStepContainer) {
                targetStepContainer.classList.add('active');
            }
            for (let i = 0; i < stepCircles.length; i++) {
                if (i + 1 < step) {
                    stepCircles[i].classList.add('completed');
                } else if (i + 1 === step) {
                    stepCircles[i].classList.add('active');
                }
            }
            currentStep = step;
            updateButtonStates();
        }

        function updateDefaultAddresses() {
            // Set default values for ESP32 variants
            flashModeSelect.value = 'dio';
            flashFreqSelect.value = '40m';
            flashSizeSelect.value = '4MB';
            if (appAddressInput) appAddressInput.value = '0x10000';
            if (bootloaderAddressInput) bootloaderAddressInput.value = '0x1000';
            if (partitionAddressInput) partitionAddressInput.value = '0x8000';
        }

        function updateFileInfo(fileInput, infoElement) {
            if (fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileSizeKB = Math.round(file.size / 1024);
                infoElement.textContent = `${file.name} (${fileSizeKB} KB)`;
            } else {
                infoElement.textContent = 'No file selected';
            }
        }

        function updateFlashSummary() {
            flashSummaryElem.innerHTML = '';
            flashSummaryElem.classList.add('flash-summary-box');
            let hasBinaries = false;
            const addSummaryItem = (icon, text) => {
                flashSummaryElem.innerHTML += `<div class="summary-item"><i class="bi ${icon} me-2"></i> ${text}</div>`;
            };

            // --- FIX: Use selectedFirmwareMethod instead of firmwareSourceSelect.value ---
            // const source = firmwareSourceSelect.value; // REMOVE THIS

            // Check based on the *selected method*
            if (selectedFirmwareMethod === 'download' && extractedGbFiles) {
                // Use extracted GB data
                 if (extractedGbFiles.app.data) {
                     const address = extractedGbFiles.app.addressInput.value;
                     addSummaryItem('bi-file-earmark-binary', `Application: ${extractedGbFiles.app.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
                 if (extractedGbFiles.bootloader.data) {
                     const address = extractedGbFiles.bootloader.addressInput.value;
                     addSummaryItem('bi-hdd-network', `Bootloader: ${extractedGbFiles.bootloader.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
                 if (extractedGbFiles.partition.data) {
                     const address = extractedGbFiles.partition.addressInput.value;
                     addSummaryItem('bi-table', `Partition Table: ${extractedGbFiles.partition.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
            } else if (selectedFirmwareMethod === 'manual') {
                // Use manual inputs
                 if (appFileInput?.files?.length > 0) {
                    const file = appFileInput.files[0];
                    const address = appAddressInput.value;
                    addSummaryItem('bi-file-earmark-binary', `Application: ${file.name} at ${address}`);
                    hasBinaries = true;
                 }
                 if (bootloaderFileInput?.files?.length > 0) {
                    const file = bootloaderFileInput.files[0];
                    const address = bootloaderAddressInput.value;
                    addSummaryItem('bi-hdd-network', `Bootloader: ${file.name} at ${address}`);
                    hasBinaries = true;
                 }
                 if (partitionFileInput?.files?.length > 0) {
                    const file = partitionFileInput.files[0];
                    const address = partitionAddressInput.value;
                    addSummaryItem('bi-table', `Partition Table: ${file.name} at ${address}`);
                    hasBinaries = true;
                 }
            } // else: No method selected or no files yet

            // --- The rest of the function is fine ---
            if (!hasBinaries) {
                flashSummaryElem.innerHTML = '<div class="summary-item text-warning"><i class="bi bi-exclamation-triangle me-2"></i> Select method and provide firmware</div>';
                if (flashButton) flashButton.disabled = true;
            } else {
                 if (flashButton) flashButton.disabled = !connected;
            }
            addSummaryItem('bi-gear', `Settings: ${flashModeSelect.value.toUpperCase()}, ${flashFreqSelect.value}, ${flashSizeSelect.value}`);
            addSummaryItem('bi-shield-check text-success', '<strong>Flash factory app only (preserving NVS & SPIFFS)</strong>');
             updateButtonStates();
        }

        function hasFirmwareFilesSelected() {
            // --- FIX: Use selectedFirmwareMethod instead of firmwareSourceSelect.value ---
             // const source = firmwareSourceSelect.value; // REMOVE THIS

             // Check based on the *selected method*
             if (selectedFirmwareMethod === 'download') {
                 // If download was chosen, check if GB files were extracted
                 return extractedGbFiles && (extractedGbFiles.app.data || extractedGbFiles.bootloader.data || extractedGbFiles.partition.data);
             } else if (selectedFirmwareMethod === 'manual') {
                 // Original check for manual files
                 return (appFileInput?.files?.length > 0) ||
                        (bootloaderFileInput?.files?.length > 0) ||
                        (partitionFileInput?.files?.length > 0);
             }
             return false; // No method selected yet
        }

        async function connect() {
            // Disable connect button during connection attempt
             if (connectButton) connectButton.disabled = true;

            try {
                espLoaderTerminal.writeLine(`Requesting WebSerial port. Select your device from the popup...`);

                // --- Serial Options ---
                let serialOptions = {}; // No filters - show all devices

                const device = await navigator.serial.requestPort(serialOptions); // Use potentially modified options
                transport = new window.esptoolJS.Transport(device);

                espLoaderTerminal.writeLine("Connecting to device...");
                updateStatusIndicator('flashing', 'Connecting...', '');
                espLoader = new window.esptoolJS.ESPLoader({
                    transport: transport,
                    baudrate: 115200, // Fixed baud rate
                    terminal: espLoaderTerminal,
                    enableTracing: true
                });
                chipType = await espLoader.main();
                espLoaderTerminal.writeLine(`Connected to ${chipType}`);
                let chipInfoText = `<span class="status-indicator status-connected"></span> Connected to ${chipType}`;
                chipInfoElem.innerHTML = chipInfoText;
                connected = true;
                updateButtonStates();
                try {
                    const flashSizeBytes = await espLoader.getFlashSize();
                    if (flashSizeBytes) {
                        const sizeInMB = flashSizeBytes / (1024 * 1024);
                        espLoaderTerminal.writeLine(`Flash size: ${sizeInMB} MB`);
                    }
                } catch (error) {
                    espLoaderTerminal.writeLine("Couldn't determine flash size");
                }
                if (nextToStep2Button) nextToStep2Button.disabled = false;
                updateStatusIndicator('success', 'Connected', `${chipType}`);
                espLoaderTerminal.writeLine("Device info:");
                try {
                    if (device.getInfo) {
                        const info = device.getInfo();
                        espLoaderTerminal.writeLine(`USB Vendor ID: 0x${info.usbVendorId.toString(16).padStart(4, '0')}`);
                        espLoaderTerminal.writeLine(`USB Product ID: 0x${info.usbProductId.toString(16).padStart(4, '0')}`);
                    }
                } catch (e) {
                    espLoaderTerminal.writeLine("Could not get device details");
                }
            } catch (error) {
                console.error("Error during connection with main():", error);
                let userMessage = `Error: ${error.message}`;
                let chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Connection failed`;
                let statusIndicatorDetails = `Error: ${error.message}`;
                let statusIndicatorTitle = 'Connection Failed';
                const errorStr = error.message.toLowerCase();
                if (errorStr.includes("failed to connect") ||
                    errorStr.includes("timed out waiting for packet") ||
                    errorStr.includes("invalid head of packet") ||
                    errorStr.includes("no serial data received")) {
                    userMessage = `Connection failed. Ensure the device is in bootloader mode (hold BOOT, press RESET) and try again. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Check Bootloader Mode`;
                    statusIndicatorTitle = 'Check Bootloader Mode';
                    statusIndicatorDetails = 'Hold BOOT/FLASH, press RESET, then try connecting.';
                } else if (errorStr.includes("access denied") ||
                    errorStr.includes("port is already open") ||
                    errorStr.includes("failed to open serial port")) {
                    userMessage = `Error: Could not open serial port. Is it already open in another program (like Arduino IDE, PlatformIO Monitor)? Close other connections and try again. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Port In Use?`;
                    statusIndicatorTitle = 'Port Access Error';
                    statusIndicatorDetails = 'Close other serial programs (IDE, Monitor) and retry.';
                } else if (errorStr.includes("the device has been lost")) {
                    userMessage = `Error: Device disconnected during connection attempt. Check cable and connection. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Device Lost`;
                    statusIndicatorTitle = 'Device Disconnected';
                    statusIndicatorDetails = 'Check USB cable and connection.';
                } else {
                    userMessage = `Connection Error: ${error.message}`;
                     chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Connection Failed`;
                     statusIndicatorTitle = 'Connection Failed';
                     statusIndicatorDetails = `Error: ${error.message}`; // Show the actual error here
                }


                espLoaderTerminal.writeLine(userMessage); // Display detailed message in terminal
                chipInfoElem.innerHTML = chipInfoMessage; // Update chip info display
                // Ensure connect button is re-enabled on failure
                if (connectButton) connectButton.disabled = false;
                connected = false; // Ensure state is consistent
                updateButtonStates(); // Update UI based on failed state
                updateStatusIndicator('error', statusIndicatorTitle, statusIndicatorDetails); // Update status indicator with appropriate details
            }
        }

        async function disconnect() {
            if (transport && espLoader) {
                try {
                    await transport.disconnect();
                    connected = false;
                    updateButtonStates();
                    chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Disconnected`;
                    if (nextToStep2Button) nextToStep2Button.disabled = true;
                    return true;
                } catch (error) {
                    console.error(error);
                    espLoaderTerminal.writeLine(`Error disconnecting: ${error.message}`);
                    return false;
                }
            }
            // If already disconnected, ensure state is correct
            connected = false;
            updateButtonStates();
            chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Disconnected`;
            if (nextToStep2Button) nextToStep2Button.disabled = true;
            return true;
        }

        async function resetDevice() {
            if (!transport || !connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device. Cannot reset.");
                return;
            }

            try {
                if (resetButton) resetButton.disabled = true;
                espLoaderTerminal.writeLine("Resetting device...");

                // RTS toggle method (ESP-IDF monitor style - most reliable for ESP32)
                // RTS=true = EN=LOW (reset), RTS=false = EN=HIGH (run)
                // Put chip in reset (EN=LOW)
                await transport.setRTS(true);
                await new Promise((resolve) => setTimeout(resolve, 50));
                // Release reset (EN=HIGH) - let chip boot
                await transport.setRTS(false);
                await new Promise((resolve) => setTimeout(resolve, 50));

                espLoaderTerminal.writeLine("Device reset completed. Device should restart now.");
            } catch (error) {
                console.error("Error resetting device:", error);
                espLoaderTerminal.writeLine(`Error resetting device: ${error.message}`);
            } finally {
                if (resetButton) resetButton.disabled = false;
            }
        }

        async function flash(preserveSettings = true) {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device");
                return;
            }

            if (!hasFirmwareFilesSelected()) {
                espLoaderTerminal.writeLine("Please select/load at least one firmware file");
                return;
            }

            // Clear ETA at the start
            if (flashETAElem) flashETAElem.textContent = '';

            // Disable buttons during flash
            flashButton.disabled = true;
            eraseButton.disabled = true;
            disconnectButton.disabled = true;

            let flashStartTime = null; // Variable to store flash start time

            try {
                espLoaderTerminal.writeLine("Preparing to flash...");
                chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Preparing Flash...`;
                updateStatusIndicator('flashing', 'Preparing flash...', '');

                // --- Start: Erase Logic Update ---
                let eraseSuccessful = true; // Assume success if not erasing
                if (preserveSettings) {
                    espLoaderTerminal.writeLine("Preserve Remote Settings enabled - skipping erase, will flash factory app only");
                    updateStatusIndicator('flashing', 'Skipping erase...', 'Preserving NVS & SPIFFS');
                } else {
                    espLoaderTerminal.writeLine("Full erase and flash mode - will erase all flash and flash complete firmware");
                    updateStatusIndicator('flashing', 'Erasing flash...', 'This may take a moment...');
                    try {
                        await eraseFlashInternal(); // Await the erase operation
                    } catch (eraseError) {
                        espLoaderTerminal.writeLine(`❌ Erase failed: ${eraseError.message}. Aborting flash operation.`);
                        chipInfoElem.innerHTML = `<span class="status-indicator status-error"></span> Erase Failed`;
                        updateStatusIndicator('error', 'Erase Failed', eraseError.message);
                        eraseSuccessful = false; // Mark erase as failed
                    }
                }

                if (!eraseSuccessful) {
                    updateButtonStates();
                    return; // Stop the flash process
                }
                // --- End: Erase Logic Update ---


                espLoaderTerminal.writeLine("Processing firmware files...");
                updateStatusIndicator('flashing', 'Processing files...', '');

                const fileArray = [];
                const source = selectedFirmwareMethod === 'download' ? 'ghostesp' : 'manual';

                // --- Use extracted GB data if available ---
                if (source === 'ghostesp' && extractedGbFiles) {
                    espLoaderTerminal.writeLine("Using auto-loaded GB files...");
                    for (const key in extractedGbFiles) {
                        const fileInfo = extractedGbFiles[key];
                        if (fileInfo.data) {
                            // Skip bootloader and partition if preserving settings
                            if (preserveSettings && (key === 'bootloader' || key === 'partition')) {
                                espLoaderTerminal.writeLine(`Skipping ${fileInfo.name} (preserving existing bootloader/partition)`);
                                continue;
                            }

                            const flashAddress = parseInt(fileInfo.addressInput.value, 16);
                            // Convert ArrayBuffer to the binary string esptool.js expects
                            const uint8Data = new Uint8Array(fileInfo.data);
                            let binaryString = '';
                            for (let i = 0; i < uint8Data.length; i++) {
                                binaryString += String.fromCharCode(uint8Data[i]);
                            }

                            fileArray.push({
                                data: binaryString,
                                address: flashAddress,
                                name: fileInfo.name, // Store name for progress reporting
                                type: fileInfo.type // Store type for offset check
                            });
                             espLoaderTerminal.writeLine(`Prepared ${fileInfo.name} for address 0x${flashAddress.toString(16)}`);
                        }
                    }
                }
                // --- Fallback to manual file inputs ---
                else {
                    espLoaderTerminal.writeLine("Using manually selected files...");
                for (const [inputElem, addressInput, fileType] of [
                    [appFileInput, appAddressInput, 'Application'],
                    [bootloaderFileInput, bootloaderAddressInput, 'Bootloader'],
                    [partitionFileInput, partitionAddressInput, 'Partition']
                ]) {
                        if (inputElem?.files?.length > 0) {
                        // Skip bootloader and partition if preserving settings
                        if (preserveSettings && (fileType === 'Bootloader' || fileType === 'Partition')) {
                            espLoaderTerminal.writeLine(`Skipping ${fileType} (preserving existing bootloader/partition)`);
                            continue;
                        }

                        const file = inputElem.files[0];
                        const firmware = await file.arrayBuffer();
                        const flashAddress = parseInt(addressInput.value, 16);

                            // Convert ArrayBuffer to binary string
                        const uint8Data = new Uint8Array(firmware);
                        let binaryString = '';
                        for (let i = 0; i < uint8Data.length; i++) {
                            binaryString += String.fromCharCode(uint8Data[i]);
                        }

                            fileArray.push({
                            data: binaryString,
                            address: flashAddress,
                            name: file.name,
                            type: fileType,
                                size: uint8Data.length // Keep size if needed elsewhere?
                            });
                             espLoaderTerminal.writeLine(`Prepared ${file.name} for address 0x${flashAddress.toString(16)}`);
                        }
                    }
                }

                if (fileArray.length === 0) {
                     espLoaderTerminal.writeLine("❌ No firmware data found to flash.");
                     updateButtonStates();
                     return;
                }

                fileArray.sort((a, b) => a.address - b.address);

                // --- Bootloader Offset Check (existing logic is fine) ---
                chipType = espLoader.chip.CHIP_NAME;
                 let correctBootloaderOffset = 0x1000; // Default for ESP32

                 // Determine correct offset based on chip type (add ESP32-C2 etc. if needed)
                if (chipType.includes("ESP32-S3") ||
                    chipType.includes("ESP32-C3") ||
                     chipType.includes("ESP32-C6") ||
                     chipType.includes("ESP32-H2") ||
                     chipType.includes("ESP32-C2")) { // Assuming C2/H2 also use 0x0
                    correctBootloaderOffset = 0x0;
                 } else if (chipType.includes("ESP32-P4") || chipType.includes("ESP32-C5")) { // User provided 0x2000
                      correctBootloaderOffset = 0x2000;
                }

                 // Apply correction if necessary
                 let offsetAdjusted = false;
                for (let i = 0; i < fileArray.length; i++) {
                    if (fileArray[i].type === 'Bootloader' &&
                        fileArray[i].address !== correctBootloaderOffset) {
                         espLoaderTerminal.writeLine(`⚠️ WARNING: Bootloader address 0x${fileArray[i].address.toString(16)} does not match expected offset 0x${correctBootloaderOffset.toString(16)} for ${chipType}. Adjusting.`);
                        fileArray[i].address = correctBootloaderOffset;
                         offsetAdjusted = true;
                    }
                }
                 if (offsetAdjusted) {
                     // Re-sort if addresses changed
                     fileArray.sort((a, b) => a.address - b.address);
                     espLoaderTerminal.writeLine("Re-sorted files after bootloader address correction.");
                 }

                chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Flashing...`;
                updateStatusIndicator('flashing', 'Flashing firmware...', 'Do not disconnect');

                // Helper function to format seconds into MM:SS
                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}m ${secs}s`;
                };

                const flashOptions = {
                    fileArray: fileArray.map(item => ({ data: item.data, address: item.address })),
                    flashSize: "keep",
                    flashMode: flashModeSelect.value,
                    flashFreq: flashFreqSelect.value,
                    eraseAll: false, // Erase handled above
                    compress: true,
                    reportProgress: (fileIndex, written, total) => {
                        const percentage = Math.floor((written / total) * 100);
                        flashProgressElem.style.width = `${percentage}%`;
                        // Use the name stored in our fileArray object
                        const fileName = fileArray[fileIndex] ? fileArray[fileIndex].name : `File ${fileIndex + 1}`;
                        espLoaderTerminal.writeLine(`Flashing ${fileName}: ${percentage}% (${written}/${total} bytes)`);

                        // Calculate and display ETA
                        if (flashStartTime && written > 0 && flashETAElem) {
                            const currentTime = Date.now();
                            const elapsedTimeSeconds = (currentTime - flashStartTime) / 1000;

                            // Don't show ETA immediately or if speed is zero
                            if (elapsedTimeSeconds > 1) {
                                const bytesPerSecond = written / elapsedTimeSeconds;
                                if (bytesPerSecond > 0) {
                                    const remainingBytes = total - written;
                                    const remainingSeconds = remainingBytes / bytesPerSecond;
                                    flashETAElem.textContent = `ETA: ${formatTime(remainingSeconds)}`;
                                } else {
                                    flashETAElem.textContent = 'ETA: Calculating...';
                                }
                            } else {
                                flashETAElem.textContent = 'ETA: Calculating...';
                            }
                        } else if (flashETAElem) {
                            flashETAElem.textContent = ''; // Clear if no start time or not started
                        }
                    },
                    calculateMD5Hash: calculateMd5Hash
                };

                // Add retry logic for the actual flashing
                let flashSuccess = false;
                let retryCount = 0;
                const maxRetries = 2;
                flashStartTime = Date.now(); // Record start time just before flashing begins

                while (!flashSuccess && retryCount <= maxRetries) {
                    try {
                        espLoaderTerminal.writeLine(`Starting flash write operation${retryCount > 0 ? ` (attempt ${retryCount + 1})` : ''}...`);
                        await espLoader.writeFlash(flashOptions);
                        flashSuccess = true;
                        espLoaderTerminal.writeLine("\nFlash write complete!");
                    } catch (flashError) {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            espLoaderTerminal.writeLine(`\nFlash write attempt failed: ${flashError.message}. Retrying...`);
                            try {
                                await espLoader.sync();
                            } catch (e) {
                                // Ignore sync errors
                            }
                        } else {
                            throw flashError; // No more retries
                        }
                    }
                }

                // --- Post-Flash Actions ---
                flashProgressElem.style.width = '100%';
                if (flashETAElem) flashETAElem.textContent = ''; // Clear ETA on completion
                chipInfoElem.innerHTML = `<span class="status-indicator status-success"></span> Flash Complete`;
                updateStatusIndicator('success', 'Flash complete!', 'Attempting device reset...');

                try {
                    await espLoader.softReset(true);
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (resetError) {
                    console.error("Soft reset failed:", resetError);
                }

                try {
                    await disconnect();
                } catch (err) {
                     espLoaderTerminal.writeLine(`Note: Disconnect error after reset: ${err.message}`);
                } finally {
                    const actionButtons = document.querySelector('.action-buttons');
                    if (actionButtons) {
                         actionButtons.innerHTML = `
                             <button id="flashButton" class="btn btn-success">
                                 <i class="bi bi-lightning"></i> Flash Firmware
                             </button>
                             <button id="eraseButton" class="btn btn-warning">
                                 <i class="bi bi-trash"></i> Erase Device & Flash
                             </button>
                         `;
                         // Reattach event listeners
                        document.getElementById('flashButton').addEventListener('click', flash);
                        document.getElementById('eraseButton').addEventListener('click', eraseFlash);
                    }
                    connected = false; // Assume disconnect happened or reset lost connection
                    updateButtonStates();
                    espLoaderTerminal.writeLine("Flash process complete. Device may have reset.");
                    updateStatusIndicator('success', 'Flash Complete', 'Device may have reset. Disconnected.');
                }

            } catch (error) {
                console.error("Error during flash process:", error);
                espLoaderTerminal.writeLine(`\nError flashing: ${error.message}`);
                if (flashETAElem) flashETAElem.textContent = '';
                chipInfoElem.innerHTML = `<span class="status-indicator status-error"></span> Flash failed`;
                flashProgressElem.style.width = '0%';
                updateStatusIndicator('error', 'Flash failed', error.message);
            } finally {
                 // Ensure buttons are re-enabled based on the final state (connected or not)
                 updateButtonStates();
            }
        }

        // Replace the calculateMd5 function with this simpler version
        function calculateMd5Hash(image) {
            // Just return null to use the built-in CRC verification
            // This is safer than trying to use MD5 which is deprecated in modern browsers
            return null;
        }

        // NEW Internal helper function for erasing flash
        async function eraseFlashInternal() {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device to erase.");
                throw new Error("Device not connected for erasing.");
            }

            // --- Show Global Indicator ---
            if (globalStatusIndicator) {
                globalStatusIndicator.textContent = '⏳ Erasing flash, please wait... This may take a moment.';
                globalStatusIndicator.className = 'alert alert-warning mt-3'; // Reset classes and show
                globalStatusIndicator.classList.remove('d-none');
            }

            try {
                // --- CHANGE: Improve Erase Feedback ---
                espLoaderTerminal.writeLine("Erasing flash (this may take a moment)...");
                chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Erasing...`;
                updateStatusIndicator('flashing', 'Erasing flash...', 'This may take a moment...');
                // --- End Change ---

                await espLoader.eraseFlash();

                espLoaderTerminal.writeLine("Flash erased successfully");
                chipInfoElem.innerHTML = `<span class="status-indicator status-connected"></span> Flash erased`;
                updateStatusIndicator('success', 'Flash erased', 'Ready to flash firmware');

                // --- Update Global Indicator on Success ---
                if (globalStatusIndicator) {
                    globalStatusIndicator.textContent = '✅ Flash erased successfully.';
                    globalStatusIndicator.className = 'alert alert-success mt-3'; // Change to success style
                    // Optional: Hide after a delay
                    setTimeout(() => globalStatusIndicator.classList.add('d-none'), 3000);
                }

                return true; // Indicate success
            } catch (error) {
                console.error("Error during erase:", error);
                espLoaderTerminal.writeLine(`Error erasing flash: ${error.message}`);
                chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Erase failed`;
                updateStatusIndicator('error', 'Erase failed', error.message);

                // --- Update Global Indicator on Error ---
                 if (globalStatusIndicator) {
                    globalStatusIndicator.textContent = `❌ Error erasing flash: ${error.message}`;
                    globalStatusIndicator.className = 'alert alert-danger mt-3'; // Change to error style
                     // Optional: Hide after a delay
                    setTimeout(() => globalStatusIndicator.classList.add('d-none'), 5000);
                 }

                throw error; // Rethrow the error to be caught by the caller if needed
            }
            // --- REMOVED finally block for hiding indicator here, handled in success/error ---
        }

        // Function to show erase confirmation dialog
        function showEraseConfirmation() {
            return new Promise((resolve) => {
                // Create modal HTML
                const modalHtml = `
                    <div class="modal fade" id="eraseConfirmModal" tabindex="-1" aria-labelledby="eraseConfirmModalLabel" aria-hidden="true">
                        <div class="modal-dialog modal-dialog-centered">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title" id="eraseConfirmModalLabel">
                                        <i class="bi bi-exclamation-triangle text-warning me-2"></i>
                                        Confirm Full Erase & Flash
                                    </h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-danger text-white" role="alert">
                                        <h6 class="alert-heading text-white">
                                            <i class="bi bi-exclamation-triangle-fill me-2"></i>
                                            WARNING: This will erase ALL data and flash new firmware!
                                        </h6>
                                        <p class="mb-2 text-white">This procedure will completely erase the flash memory, remove all data, and flash new firmware:</p>
                                        <ul class="mb-2 text-white">
                                            <li><strong>Odometer readings</strong> - All mileage data will be lost</li>
                                            <li><strong>VESC settings</strong> - configuration will be reset</li>
                                            <li><strong>Throttle calibrations</strong> - You'll need to recalibrate the throttle</li>
                                            <li><strong>All your configuration data</strong> - Custom configurations and files</li>
                                        </ul>
                                        <hr class="border-light">
                                        <p class="mb-0 text-white">
                                            <strong>You will need to:</strong><br>
                                            • Reconfigure the remote settings<br>
                                            • Recalibrate the throttle system<br>
                                        </p>
                                    </div>
                                    <p class="text-muted">
                                        <i class="bi bi-info-circle me-1"></i>
                                        This action cannot be undone. Are you absolutely sure you want to proceed?
                                    </p>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                        <i class="bi bi-x-circle me-1"></i>Cancel
                                    </button>
                                    <button type="button" class="btn btn-danger" id="confirmEraseBtn">
                                        <i class="bi bi-trash me-1"></i>Erase & Flash
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // Add modal to body
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                const modal = document.getElementById('eraseConfirmModal');
                const confirmBtn = document.getElementById('confirmEraseBtn');
                const cancelBtn = modal.querySelector('.btn-secondary');
                const bsModal = new bootstrap.Modal(modal);

                // Set up event listeners
                confirmBtn.addEventListener('click', () => {
                    bsModal.hide();
                    setTimeout(() => {
                        modal.remove();
                        // Remove any remaining backdrop
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                        // Remove modal-open class from body
                        document.body.classList.remove('modal-open');
                        document.body.style.overflow = '';
                    }, 150);
                    resolve(true);
                });

                cancelBtn.addEventListener('click', () => {
                    bsModal.hide();
                    setTimeout(() => {
                        modal.remove();
                        // Remove any remaining backdrop
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) {
                            backdrop.remove();
                        }
                        // Remove modal-open class from body
                        document.body.classList.remove('modal-open');
                        document.body.style.overflow = '';
                    }, 150);
                    resolve(false);
                });

                // Handle modal close events
                modal.addEventListener('hidden.bs.modal', () => {
                    modal.remove();
                    // Remove any remaining backdrop
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.remove();
                    }
                    // Remove modal-open class from body
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    resolve(false);
                });

                // Show the modal
                bsModal.show();
            });
        }

        // UPDATED eraseFlash function (for the button)
        async function eraseFlash() {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device");
                return;
            }

            // Show confirmation dialog
            const confirmed = await showEraseConfirmation();
            if (!confirmed) {
                espLoaderTerminal.writeLine("Erase operation cancelled by user");
                return;
            }

            // Disable buttons during erase
            eraseButton.disabled = true;
            flashButton.disabled = true;

            try {
                // First erase the flash
                espLoaderTerminal.writeLine("Starting complete erase and flash operation...");
                await eraseFlashInternal();
                espLoaderTerminal.writeLine("✅ Erase completed successfully. Now flashing firmware...");

                // After successful erase, proceed with flashing all files
                await flash(false);

            } catch (error) {
                // Error already logged and indicator handled by eraseFlashInternal or flash
                espLoaderTerminal.writeLine("❌ Erase and flash operation failed.");
            } finally {
                // Re-enable buttons based on state
                updateButtonStates();
            }
        }


        function updateButtonStates() {
            // Connection buttons
            if (connectButton) connectButton.disabled = connected;
            if (resetButton) resetButton.disabled = !connected;
            if (disconnectButton) disconnectButton.disabled = !connected;

            // Action buttons depend on method and files/connection
            // Call hasFirmwareFilesSelected safely here
            const canFlash = connected && hasFirmwareFilesSelected();
            if (flashButton) flashButton.disabled = !canFlash;
            if (eraseButton) eraseButton.disabled = !connected;
            if (eraseButton) eraseButton.disabled = !connected;

            // Connection settings
            // if (baudrateSelect) baudrateSelect.disabled = connected;
            // if (resetMethodSelect) resetMethodSelect.disabled = connected;

            // Disable next step buttons based on state
            if (nextToStep2Button) nextToStep2Button.disabled = !connected;
            // Call hasFirmwareFilesSelected safely here
            if (nextToStep3Button) nextToStep3Button.disabled = !hasFirmwareFilesSelected();
        }

        // Check if WebSerial is supported
        if (!navigator.serial) {
            espLoaderTerminal.writeLine("WebSerial is not supported in this browser. Please use Chrome or Edge version 89 or later.");
            connectButton.disabled = true;

            // Create and show a modal popup with dark theme styling
            const modalCss = `
                <style>
                    #webSerialModal {
                        z-index: 10002 !important; /* Higher than eyes */
                    }
                    .modal-backdrop {
                        z-index: 10001 !important; /* Higher than eyes but below modal */
                    }
                </style>
            `;

            const modalHtml = `
            ${modalCss}
            <div class="modal fade" id="webSerialModal" tabindex="-1" aria-hidden="true" style="z-index: 10002;">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                Browser Not Supported
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-danger">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                WebSerial is not supported in this browser.
                            </div>
                            <p>Please use a supported browser:</p>
                            <ul>
                                <li>Chrome (v89+)</li>
                                <li>Edge (v89+)</li>
                                <li>Opera (v76+)</li>
                            </ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>`;

            // Append modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Show the modal
            const webSerialModal = new bootstrap.Modal(getElementById('webSerialModal'));
            webSerialModal.show();
        } else {
            espLoaderTerminal.writeLine("GB Remote Flashing Tool ready. Connect your ESP32 device to get started.");
        }

        // Initialize the UI
        goToStep(1);

        // Add event listeners for "I'm Stuck" buttons
        const stuckButtons = document.querySelectorAll('.stuck-button');
        console.log('[Debug] Found stuck buttons:', stuckButtons.length); // Log: Check if buttons are found
        console.log('[Debug] Bootstrap object available?', typeof bootstrap !== 'undefined', window.bootstrap); // Log: Check Bootstrap object

        stuckButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const step = button.dataset.step;
                console.log(`[Debug] Stuck button clicked for step: ${step}`); // Log: Button click

                const modalId = `stuckModalStep${step}`;
                const modalElement = document.getElementById(modalId);
                console.log(`[Debug] Attempting to find modal element with ID: ${modalId}`, modalElement); // Log: Modal element search

                if (modalElement) {
                    console.log('[Debug] Modal element found.');
                    if (bootstrap && bootstrap.Modal) {
                        try {
                            console.log('[Debug] Bootstrap and bootstrap.Modal found. Creating and showing modal...'); // Log: Attempting to show
                            const modalInstance = new bootstrap.Modal(modalElement);
                            modalInstance.show();
                            console.log('[Debug] modalInstance.show() called.'); // Log: Show called
                        } catch (e) {
                            console.error('[Debug] Error creating or showing Bootstrap modal:', e); // Log: Error during modal show
                            espLoaderTerminal.writeLine(`Error showing help: ${e.message}`);
                        }
                    } else {
                        console.error('[Debug] Bootstrap Modal object not found!'); // Log: Bootstrap missing
                        espLoaderTerminal.writeLine('Error: Could not show help (Bootstrap Modal not loaded).');
                    }
                } else {
                    console.error(`[Debug] Could not find modal element #${modalId}`); // Log: Modal element missing
                    espLoaderTerminal.writeLine(`Error: Could not open help for step ${step} (modal element missing).`);
                }
            });
        });


        // --- Helper function to populate assets into a parent element ---
        function populateAssets(assets, parentElement, fileExtension, filterChip, repo) {
            let foundFiles = false;
            if (!assets || assets.length === 0) {
                 return false; // No assets to process
            }

            assets.forEach(asset => {
                if (asset.name.endsWith(fileExtension)) {
                    // --- Default processing for assets ---
                    foundFiles = true;
                    const option = document.createElement('option');
                    option.value = asset.browser_download_url;
                    option.textContent = asset.name;

                    parentElement.appendChild(option);
                }
            });
            return foundFiles;
        }

        async function populateRepoOptions(owner, repo, selectElementId, fileExtension = '.zip', defaultOptionText = '-- Select an option --', filterChip = null) {
            const selectElement = getElementById(selectElementId);
            if (!selectElement) {
                console.error(`Select element with ID '${selectElementId}' not found.`);
                return;
            }

            selectElement.innerHTML = `<option value="">${defaultOptionText}</option>`;
            selectElement.disabled = true;

            try {
                const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`; // Fetch all releases
                espLoaderTerminal.writeLine(`Fetching releases from ${owner}/${repo}...`);
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
                }
                const releases = await response.json();
                if (!releases || releases.length === 0) {
                    espLoaderTerminal.writeLine(`⚠️ No releases found for ${owner}/${repo}.`);
                    selectElement.innerHTML = `<option value="">No releases found</option>`;
                    return;
                }

                // Find the latest stable and pre-release
                let latestStableRelease = null;
                let latestPrerelease = null;
                for (const release of releases) {
                    if (!release.prerelease && !latestStableRelease) {
                        latestStableRelease = release;
                    }
                    if (release.prerelease && !latestPrerelease) {
                        latestPrerelease = release;
                    }
                     // Optimization: stop if we found both
                     if (latestStableRelease && latestPrerelease) break;
                }

                let optionsAdded = false;

                // Populate Stable Release
                if (latestStableRelease) {
                    const stableOptgroup = document.createElement('optgroup');
                    stableOptgroup.label = `Stable Release (${latestStableRelease.tag_name})`;
                    if (populateAssets(latestStableRelease.assets, stableOptgroup, fileExtension, filterChip, repo)) {
                        selectElement.appendChild(stableOptgroup);
                        optionsAdded = true;
                         espLoaderTerminal.writeLine(`Found stable release: ${latestStableRelease.tag_name}`);
                    } else {
                         espLoaderTerminal.writeLine(`Stable release ${latestStableRelease.tag_name} found, but no matching assets.`);
                    }
                } else {
                    espLoaderTerminal.writeLine(`No stable release found for ${owner}/${repo}.`);
                }

                // Populate Pre-release
                if (latestPrerelease) {
                    const prereleaseOptgroup = document.createElement('optgroup');
                    prereleaseOptgroup.label = `Pre-release (${latestPrerelease.tag_name})`;
                     if (populateAssets(latestPrerelease.assets, prereleaseOptgroup, fileExtension, filterChip, repo)) {
                        selectElement.appendChild(prereleaseOptgroup);
                        optionsAdded = true;
                        espLoaderTerminal.writeLine(`Found pre-release: ${latestPrerelease.tag_name}`);
                     } else {
                         espLoaderTerminal.writeLine(`Pre-release ${latestPrerelease.tag_name} found, but no matching assets.`);
                     }
                } else {
                    espLoaderTerminal.writeLine(`No pre-release found for ${owner}/${repo}.`);
                }

                if (!optionsAdded) {
                    let message = `No suitable ${fileExtension} assets found`;
                    if (repo === 'Ghost_ESP' && filterChip) {
                        message += ` for the selected chip (${filterChip})`;
                    }
                     message += ` in the latest stable or pre-releases for ${owner}/${repo}.`;
                     espLoaderTerminal.writeLine(`⚠️ ${message}`);
                     selectElement.innerHTML = `<option value="">${message}</option>`; // Keep disabled
                } else {
                     selectElement.disabled = false;
                }

            } catch (error) {
                 console.error(`Error fetching ${repo} data:`, error);
                 espLoaderTerminal.writeLine(`⚠️ Failed to fetch ${repo} list: ${error.message}`);
                 selectElement.innerHTML = `<option value="">Error loading options</option>`;
            }
        }

        // --- NEW FUNCTION: Load and process GB ZIP ---
        async function loadGbZip(zipUrl) {
            console.log(`[Debug] loadGbZip called with original URL: ${zipUrl}`); // Log original URL
            if (!zipUrl) {
                console.log('[Debug] loadGbZip: No URL provided, clearing data.');
                extractedGbFiles = null;
                updateBinaryTypeIndicators();
                updateFlashSummary();
                updateButtonStates();
                if (gbStatusElem) {
                    gbStatusElem.textContent = 'Select a variant to begin loading firmware files.';
                    gbStatusElem.className = 'form-text text-muted mt-2';
                }
                return;
            }

            // --- Use CORS-enabled proxy services ---
            // Try multiple proxy services for better reliability
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(zipUrl)}`, // AllOrigins - supports CORS
                `https://cors-anywhere.herokuapp.com/${zipUrl}`, // CORS Anywhere
                `https://fragrant-flower-ba0b.creepersbeast.workers.dev/?url=${encodeURIComponent(zipUrl)}` // Your CF Worker (fallback)
            ];

            // Use the first proxy URL for now (AllOrigins supports CORS)
            const proxyUrl = proxyUrls[0];
            console.log(`[Debug] Using CF Worker proxy URL: ${proxyUrl}`); // Log proxy URL
            espLoaderTerminal.writeLine(`Fetching firmware via proxy from ${zipUrl}...`);

            // Disable download during processing
            if (choiceDownloadCard) choiceDownloadCard.style.pointerEvents = 'none';

            extractedGbFiles = null;

            // --- Update Status UI ---
            if (gbStatusElem) {
                gbStatusElem.textContent = 'Fetching ZIP from GitHub...';
                gbStatusElem.className = 'form-text mt-2 loading'; // Add loading class
            }

            try {
                console.log('[Debug] loadGbZip: Starting fetch via proxy...');

                // Helper function to add timeout to fetch requests
                const fetchWithTimeout = (url, timeoutMs = 5000) => {
                    return Promise.race([
                        fetch(url),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
                        )
                    ]);
                };

                // Try multiple proxy services if one fails
                let response = null;
                let lastError = null;

                for (let i = 0; i < proxyUrls.length; i++) {
                    try {
                        console.log(`[Debug] Trying proxy ${i + 1}/${proxyUrls.length}: ${proxyUrls[i]}`);
                        response = await fetchWithTimeout(proxyUrls[i], 5000);
                        console.log(`[Debug] Proxy ${i + 1} response status: ${response.status}, ok: ${response.ok}`);

                        if (response.ok) {
                            console.log(`[Debug] Successfully fetched via proxy ${i + 1}`);
                            break; // Success, exit the loop
                        } else {
                            console.log(`[Debug] Proxy ${i + 1} failed with status: ${response.status}`);
                            if (i === proxyUrls.length - 1) {
                                // Last proxy failed, throw error
                                throw new Error(`All proxies failed. Last error: ${response.status}`);
                            }
                        }
                    } catch (error) {
                        console.log(`[Debug] Proxy ${i + 1} error: ${error.message}`);
                        lastError = error;

                        // Update status for timeout errors
                        if (error.message.includes('timeout')) {
                            if (gbStatusElem) {
                                gbStatusElem.textContent = `Proxy ${i + 1} timed out, trying next...`;
                                gbStatusElem.className = 'form-text text-warning mt-2';
                            }
                        }

                        if (i === proxyUrls.length - 1) {
                            // Last proxy failed, throw the last error
                            throw lastError;
                        }
                    }
                }

                // Check if the proxy itself had an issue or if the proxied request failed
                if (!response || !response.ok) {
                    // Try to get error details from the proxy response if available
                    let proxyErrorDetails = `Proxy fetch failed with status: ${response?.status || 'unknown'}`;
                    try {
                        const errorText = await response?.text();
                         // AllOrigins might return JSON with error details
                         try {
                             const errorJson = JSON.parse(errorText);
                             if (errorJson.contents && errorJson.status?.http_code) {
                                 proxyErrorDetails = `Proxied request failed: ${errorJson.status.http_code}. ${errorJson.contents}`;
                             } else {
                                 proxyErrorDetails += `. Response: ${errorText.substring(0, 200)}`; // Limit length
                             }
                         } catch (parseError) {
                              proxyErrorDetails += `. Response: ${errorText.substring(0, 200)}`; // Limit length
                         }
                    } catch (e) { /* Ignore errors reading body */ }
                     console.error(`[Debug] Proxy fetch error: ${proxyErrorDetails}`);
                     if (gbStatusElem) {
                         gbStatusElem.textContent = `Error fetching: ${response?.status || 'unknown'}`;
                         gbStatusElem.className = 'form-text text-danger mt-2 error';
                     }
                     throw new Error(proxyErrorDetails);
                }

                const zipBlob = await response.blob();
                console.log(`[Debug] loadGbZip: Downloaded Blob size: ${zipBlob.size}`);
                if (zipBlob.size === 0) {
                    throw new Error("Downloaded ZIP file is empty. Proxy or original link might be broken.");
                }
                 // Check Blob type - should be application/zip or octet-stream generally
                 console.log(`[Debug] loadGbZip: Downloaded Blob type: ${zipBlob.type}`);
                 if (zipBlob.type && !zipBlob.type.includes('zip') && !zipBlob.type.includes('octet-stream') && !zipBlob.type.includes('binary')) {
                     // Suspicious type, might be an error page from the proxy or GitHub
                     try {
                         const errorText = await zipBlob.text();
                         console.warn(`[Debug] Suspicious blob type. Content preview: ${errorText.substring(0, 200)}`);
                         // You might want to throw a more specific error here depending on content
                     } catch (e) { /* Ignore */}
                 }

                espLoaderTerminal.writeLine(`Downloaded ${Math.round(zipBlob.size / 1024)} KB ZIP. Extracting...`);

                if (gbStatusElem) gbStatusElem.textContent = 'Download complete. Extracting files...';

                console.log('[Debug] loadGbZip: Loading ZIP with JSZip...');
                const zip = await JSZip.loadAsync(zipBlob);
                console.log('[Debug] loadGbZip: JSZip loaded successfully.');

                // --- Files to extract ---
                const filesToExtract = {
                    app: { name: 'gb_controller_lite.bin', data: null, elem: appFileInfoElem, addressInput: appAddressInput, type: 'Application' }, // Updated for gb_remote
                    bootloader: { name: 'bootloader.bin', data: null, elem: bootloaderFileInfoElem, addressInput: bootloaderAddressInput, type: 'Bootloader' }, // Correct
                    partition: { name: 'partition-table.bin', data: null, elem: partitionFileInfoElem, addressInput: partitionAddressInput, type: 'Partition' } // Correct
                };

                let foundCount = 0;
                console.log('[Debug] loadGbZip: Starting file extraction loop...');
                for (const key in filesToExtract) {
                    const target = filesToExtract[key];
                    console.log(`[Debug] loadGbZip: Checking for file: ${target.name}`);

                    // Try the primary name first
                    let fileEntry = zip.file(target.name);

                    // If not found, try alternative names for specific file types
                    if (!fileEntry) {
                        if (key === 'app') {
                            // Try various possible names for the main application
                            const appNames = ['firmware.bin', 'gb_controller_lite.bin', 'gb_remote_lite.bin', 'app.bin', 'main.bin'];
                            for (const altName of appNames) {
                                fileEntry = zip.file(altName);
                                if (fileEntry) {
                                    target.name = altName;
                                    break;
                                }
                            }
                        } else if (key === 'partition') {
                            // Try alternative partition table names
                            const partitionNames = ['partitions.bin', 'partition-table.bin', 'partition.bin'];
                            for (const altName of partitionNames) {
                                fileEntry = zip.file(altName);
                                if (fileEntry) {
                                    target.name = altName;
                                    break;
                                }
                            }
                        }
                    }

                    if (fileEntry) {
                        console.log(`[Debug] loadGbZip: Found ${target.name}, extracting data...`);
                        target.data = await fileEntry.async("arraybuffer");
                        const fileSizeKB = Math.round(target.data.byteLength / 1024);
                         console.log(`[Debug] loadGbZip: Extracted ${target.name}, size: ${fileSizeKB} KB. Updating UI...`);
                        if (target.elem) {
                             target.elem.textContent = `${target.name} (${fileSizeKB} KB) [Auto-Loaded]`;
                             const dropZone = target.elem.closest('.firmware-section')?.querySelector('.custom-file-upload');
                             dropZone?.classList.add('file-uploaded');
                        }
                        espLoaderTerminal.writeLine(`Found ${target.name} (${fileSizeKB} KB)`);
                        foundCount++;
                    } else {
                         console.log(`[Debug] loadGbZip: File not found in ZIP: ${target.name}`);
                         if (target.elem) {
                            target.elem.textContent = 'Not found in ZIP';
                             const dropZone = target.elem.closest('.firmware-section')?.querySelector('.custom-file-upload');
                             dropZone?.classList.remove('file-uploaded'); // Remove uploaded class if file not found
                         }
                         espLoaderTerminal.writeLine(`Warning: ${target.name} not found in the ZIP.`);
                    }
                }
                console.log(`[Debug] loadGbZip: Extraction loop finished. Found count: ${foundCount}`);

                if (foundCount > 0) {
                     extractedGbFiles = filesToExtract;
                     espLoaderTerminal.writeLine("Extraction complete. Files ready.");
                     if (gbStatusElem) {
                         gbStatusElem.textContent = `Successfully loaded ${foundCount} files`;
                         gbStatusElem.className = 'form-text text-success mt-2 success';
                     }
                     updateBinaryTypeIndicators();
                     updateFlashSummary();
                } else {
                    // If we downloaded something but didn't find the files, clear UI state
                     clearExtractedData();
                     updateFlashSummary();
                     if (gbStatusElem) {
                         gbStatusElem.textContent = 'Error: No required .bin files found in ZIP.';
                         gbStatusElem.className = 'form-text text-danger mt-2 error';
                     }
                    throw new Error("No required .bin files found in the downloaded ZIP.");
                }

            } catch (error) {
                console.error("[Debug] Error loading or extracting GB ZIP:", error);
                espLoaderTerminal.writeLine(`❌ Error processing GB ZIP: ${error.message}`);
                extractedGbFiles = null;
                if (gbStatusElem) {
                    gbStatusElem.textContent = `Error: ${error.message}`;
                    gbStatusElem.className = 'form-text text-danger mt-2 error';
                }
                 if (appFileInfoElem) appFileInfoElem.textContent = 'ZIP Load Failed';
                 if (bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'ZIP Load Failed';
                 if (partitionFileInfoElem) partitionFileInfoElem.textContent = 'ZIP Load Failed';
                 document.querySelectorAll('.custom-file-upload.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
                 updateBinaryTypeIndicators(); // Clear badges on error
            } finally {
                console.log('[Debug] loadGbZip: Finally block reached. Re-enabling select.');
                 if (choiceDownloadCard) choiceDownloadCard.style.pointerEvents = 'auto';
                updateButtonStates();
            }
        }

        // --- Modify setupDownloadLinkListener to handle the GB case ---
        function setupDownloadLinkListener(selectElement, linkElement) {
            if (selectElement && linkElement) {
                selectElement.addEventListener('change', () => {
                    const selectedValue = selectElement.value;
                    console.log(`[Debug] Select changed for ID: ${selectElement.id}, Value: ${selectedValue}`); // <<< ADD LOG

                    // --- GB Special Handling ---
                    if (selectElement.id === 'downloadGbRemoteBtn') {
                        console.log('[Debug] GB variant selected, attempting load...'); // <<< ADD LOG
                        linkElement.href = '#'; // Keep link disabled for GB
                        linkElement.classList.add('disabled');
                        linkElement.classList.replace('btn-primary', 'btn-secondary');

                        // Trigger the load function
                        loadGbZip(selectedValue);

                    // --- Default Handling ---
                    } else {
                        console.log('[Debug] Non-GB select changed.'); // <<< ADD LOG
                        if (selectedValue) {
                            linkElement.href = selectedValue;
                        linkElement.classList.remove('disabled');
                        linkElement.classList.replace('btn-secondary', 'btn-primary');
                    } else {
                        linkElement.href = '#';
                        linkElement.classList.add('disabled');
                        linkElement.classList.replace('btn-primary', 'btn-secondary');
                        }
                    }
                });
            } else {
                 console.error(`[Debug] setupDownloadLinkListener: Missing selectElement or linkElement for ID: ${selectElement?.id}`); // <<< ADD ERROR LOG
            }
        }

        // --- Remove the early call for GB ---
        // setupDownloadLinkListener(ghostEspVariantSelect, ghostEspDownloadLink);


        // --- THIS BLOCK IS THE CULPRIT - Commenting it out ---
        /*
        if (firmwareSourceSelect) {
            firmwareSourceSelect.addEventListener('change', () => {
                const selectedSource = firmwareSourceSelect.value;
                console.log(`[Debug] Firmware source changed to: ${selectedSource}`); // <<< ADD LOG

                // Reset file inputs AND extracted data if switching away from manual/ghost
                 if (selectedSource !== 'manual') {
                     clearManualInputs(); // Use a helper for clarity
                 }
                 if (selectedSource !== 'ghostesp') {
                     clearExtractedData(); // Clear extracted data if switching away from ghost
                 }


                const allDownloadSections = [gbDownloadSection];
                // Remove download links logic as GB doesn't use it now
                // const allDownloadLinks = [ghostEspDownloadLink];

                manualUploadSection.classList.add('d-none');
                allDownloadSections.forEach(section => section?.classList.add('d-none'));
                // Clear link states


                if (selectedSource === 'manual') {
                     console.log('[Debug] Source is manual, showing manual section.'); // <<< ADD LOG
                    manualUploadSection.classList.remove('d-none');
                } else if (selectedSource === 'ghostesp') {
                     console.log('[Debug] Source is ghostesp, showing section and populating options...'); // <<< ADD LOG
                    gbDownloadSection?.classList.remove('d-none');

                updateFlashSummary(); // Update summary after source change
                updateButtonStates(); // Update buttons after source change
            });

            // Trigger change on load IF a device is already selected maybe?
            // Or just let manual be default.
             console.log('[Debug] Dispatching initial change event for firmwareSourceSelect'); // <<< ADD LOG
            firmwareSourceSelect.dispatchEvent(new Event('change'));
        }
        */ // <<< --- End of commented out block ---

        // --- Helper to clear manual file inputs ---
        function clearManualInputs() {
             if (appFileInput) appFileInput.value = '';
             if (bootloaderFileInput) bootloaderFileInput.value = '';
             if (partitionFileInput) partitionFileInput.value = '';
             if(appFileInfoElem) appFileInfoElem.textContent = 'No file selected';
             if(bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'No file selected';
             if(partitionFileInfoElem) partitionFileInfoElem.textContent = 'No file selected';
             // Clear visual indicators too
             document.querySelectorAll('.custom-file-upload.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
             updateBinaryTypeIndicators();
        }

        // --- Helper to clear extracted data ---
        function clearExtractedData() {
            if (extractedGbFiles) {
                // Clear the stored data
                extractedGbFiles = null;
                // Optionally clear the UI text if it was set by extraction
                // Check if the current text indicates it was auto-loaded before clearing
                if (appFileInfoElem?.textContent.includes('[Auto-Loaded]')) appFileInfoElem.textContent = 'No file selected';
                if (bootloaderFileInfoElem?.textContent.includes('[Auto-Loaded]')) bootloaderFileInfoElem.textContent = 'No file selected';
                if (partitionFileInfoElem?.textContent.includes('[Auto-Loaded]')) partitionFileInfoElem.textContent = 'No file selected';
                // Clear visual indicators
                document.querySelectorAll('.custom-file-upload.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
                updateBinaryTypeIndicators();
                espLoaderTerminal.writeLine("Cleared auto-loaded GB files.");
            }
        }

        // --- Modify updateBinaryTypeIndicators to check extracted data ---
        function updateBinaryTypeIndicators() {
            // Clear existing badges first
            document.querySelectorAll('.file-badge').forEach(badge => badge.remove());

            // FIX: Use selectedFirmwareMethod instead of the removed firmwareSourceSelect
            // const source = firmwareSourceSelect.value;
            const method = selectedFirmwareMethod; // Use the current method variable

            let hasApp = false, hasBootloader = false, hasPartition = false;

            // Check based on the selected method
            if (method === 'download' && extractedGbFiles) {
                hasApp = !!extractedGbFiles.app.data;
                hasBootloader = !!extractedGbFiles.bootloader.data;
                hasPartition = !!extractedGbFiles.partition.data;
            } else if (method === 'manual') { // Check the manual method
                 hasApp = appFileInput?.files?.length > 0;
                 hasBootloader = bootloaderFileInput?.files?.length > 0;
                 hasPartition = partitionFileInput?.files?.length > 0;
            }

            if (hasApp) {
                const appButton = document.querySelector('[data-binary="app"]');
                appButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasBootloader) {
                const bootloaderButton = document.querySelector('[data-binary="bootloader"]');
                 bootloaderButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasPartition) {
                const partitionButton = document.querySelector('[data-binary="partition"]');
                 partitionButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
        }

        // --- NEW: Event Listeners for Primary Choice Cards ---
        if (choiceDownloadCard) {
            choiceDownloadCard.addEventListener('click', () => {
                selectFirmwareMethod('download');
            });
        }
        if (choiceManualCard) {
            choiceManualCard.addEventListener('click', () => {
                selectFirmwareMethod('manual');
            });
        }


        function selectFirmwareMethod(method) {
            selectedFirmwareMethod = method;

            // Update card appearance
            choiceDownloadCard?.classList.toggle('selected', method === 'download');
            choiceManualCard?.classList.toggle('selected', method === 'manual');

            // Show/hide relevant containers
            downloadOptionsContainer?.classList.toggle('d-none', method !== 'download');
            manualUploadContainer?.classList.toggle('d-none', method !== 'manual');

            // Reset state if switching
            if (method === 'download') {
                clearManualInputs();
                // Show download section
                gbDownloadSection?.classList.remove('d-none');

                // Automatically download and extract files
                downloadAndExtractFiles();
            } else { // method === 'manual'
                clearExtractedData();
                gbDownloadSection?.classList.add('d-none');
                // Maybe auto-select the 'app' toggle?
                document.querySelector('.binary-type-toggle .btn[data-binary="app"]')?.click();
            }

            updateFlashSummary(); // Update summary based on new state
            updateButtonStates(); // Update buttons
        }

        // Function to automatically download and extract files
        async function downloadAndExtractFiles() {
            try {
                // Update status
                if (gbStatusElem) {
                    gbStatusElem.textContent = 'Fetching latest release from georgebenett/gb_remote...';
                    gbStatusElem.className = 'form-text mt-2 loading';
                }

                // Get the latest release URL for gb_remote_lite.zip
                const apiUrl = 'https://api.github.com/repos/georgebenett/gb_remote/releases/latest';
                espLoaderTerminal.writeLine('Fetching latest release from georgebenett/gb_remote...');

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
                }

                const release = await response.json();

                // Look for assets matching the actual naming pattern: "gb_remote_lite_vX.X.X.zip"
                // First try to find an asset that starts with "gb_remote_lite_v" and ends with ".zip"
                let zipAsset = release.assets.find(asset =>
                    asset.name.startsWith('gb_remote_lite_v') && asset.name.endsWith('.zip')
                );

                // Fallback to the old naming pattern for backward compatibility
                if (!zipAsset) {
                    zipAsset = release.assets.find(asset => asset.name === 'gb_remote_lite.zip');
                }

                if (!zipAsset) {
                    throw new Error('GB Remote Lite firmware zip file not found in latest release');
                }

                espLoaderTerminal.writeLine(`Found firmware zip file "${zipAsset.name}" in release ${release.tag_name}`);

                // Download and extract the ZIP
                await loadGbZip(zipAsset.browser_download_url);

            } catch (error) {
                console.error('Error downloading GB Remote Lite firmware:', error);
                espLoaderTerminal.writeLine(`❌ Error downloading firmware: ${error.message}`);
                if (gbStatusElem) {
                    gbStatusElem.textContent = `Error: ${error.message}`;
                    gbStatusElem.className = 'form-text text-danger mt-2 error';
                }
            }
        }





        // --- REMOVE OLD firmwareSourceSelect listener ---
        /*
        if (firmwareSourceSelect) {
            firmwareSourceSelect.addEventListener('change', () => {
               // ... OLD LOGIC ...
            });
             console.log('[Debug] Dispatching initial change event for firmwareSourceSelect');
            firmwareSourceSelect.dispatchEvent(new Event('change'));
        }
        */

        // --- Modify hasFirmwareFilesSelected ---
        function hasFirmwareFilesSelected() {
             // Check based on the *selected method*
             if (selectedFirmwareMethod === 'download') {
                 // If download was chosen, check if GB files were extracted
                 return extractedGbFiles && (extractedGbFiles.app.data || extractedGbFiles.bootloader.data || extractedGbFiles.partition.data);
             } else if (selectedFirmwareMethod === 'manual') {
                 // Original check for manual files
                 return (appFileInput?.files?.length > 0) ||
                        (bootloaderFileInput?.files?.length > 0) ||
                        (partitionFileInput?.files?.length > 0);
             }
             return false; // No method selected yet
        }

        // --- Modify updateFlashSummary ---
        function updateFlashSummary() {
            flashSummaryElem.innerHTML = '';
            flashSummaryElem.classList.add('flash-summary-box');
            let hasBinaries = false;
            const addSummaryItem = (icon, text) => {
                flashSummaryElem.innerHTML += `<div class="summary-item"><i class="bi ${icon} me-2"></i> ${text}</div>`;
            };

            // Check based on the *selected method*
            if (selectedFirmwareMethod === 'download' && extractedGbFiles) {
                // Use extracted GB data
                 if (extractedGbFiles.app.data) {
                     const address = extractedGbFiles.app.addressInput.value;
                     addSummaryItem('bi-file-earmark-binary', `Application: ${extractedGbFiles.app.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
                 if (extractedGbFiles.bootloader.data) {
                     const address = extractedGbFiles.bootloader.addressInput.value;
                     addSummaryItem('bi-hdd-network', `Bootloader: ${extractedGbFiles.bootloader.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
                 if (extractedGbFiles.partition.data) {
                     const address = extractedGbFiles.partition.addressInput.value;
                     addSummaryItem('bi-table', `Partition Table: ${extractedGbFiles.partition.name} at ${address} [Auto]`);
                     hasBinaries = true;
                 }
            } else if (selectedFirmwareMethod === 'manual') {
                // Use manual inputs
                 if (appFileInput?.files?.length > 0) {
                     // ... (manual file summary) ...
                 }
                 // ... (bootloader/partition summary) ...
            } // else: No method selected or no files yet

             // --- Fallback to manual inputs (keep existing logic inside the 'else' block) ---
             if (selectedFirmwareMethod === 'manual') {
                if (appFileInput?.files?.length > 0) {
                    const file = appFileInput.files[0];
                    const address = appAddressInput.value;
                    addSummaryItem('bi-file-earmark-binary', `Application: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
                if (bootloaderFileInput?.files?.length > 0) {
                    const file = bootloaderFileInput.files[0];
                    const address = bootloaderAddressInput.value;
                    addSummaryItem('bi-hdd-network', `Bootloader: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
                if (partitionFileInput?.files?.length > 0) {
                    const file = partitionFileInput.files[0];
                    const address = partitionAddressInput.value;
                    addSummaryItem('bi-table', `Partition Table: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
             }

            if (!hasBinaries) {
                flashSummaryElem.innerHTML = '<div class="summary-item text-warning"><i class="bi bi-exclamation-triangle me-2"></i> Select method and provide firmware</div>';
                if (flashButton) flashButton.disabled = true;
            } else {
                 if (flashButton) flashButton.disabled = !connected;
            }
            addSummaryItem('bi-gear', `Settings: ${flashModeSelect.value.toUpperCase()}, ${flashFreqSelect.value}, ${flashSizeSelect.value}`);
            addSummaryItem('bi-shield-check text-success', '<strong>Flash factory app only (preserving NVS & SPIFFS)</strong>');
             updateButtonStates();
        }


        // --- Modify startOver button ---
         startOverButton.addEventListener('click', () => {
             selectFirmwareMethod(null); // Reset the primary choice
             // Existing clear functions are good
             clearExtractedData();
             clearManualInputs();
             if (connected) {
                 disconnect().then(() => goToStep(1));
             } else {
                 goToStep(1);
             }
         });

        // --- Modify updateBinaryTypeIndicators ---
        function updateBinaryTypeIndicators() {
            document.querySelectorAll('.file-badge').forEach(badge => badge.remove());

            let hasApp = false, hasBootloader = false, hasPartition = false;

            // Only show badges based on the *current* state, respecting selected method
            if (selectedFirmwareMethod === 'download' && extractedGbFiles) {
                hasApp = !!extractedGbFiles.app.data;
                hasBootloader = !!extractedGbFiles.bootloader.data;
                hasPartition = !!extractedGbFiles.partition.data;
            } else if (selectedFirmwareMethod === 'manual') {
                 hasApp = appFileInput?.files?.length > 0;
                 hasBootloader = bootloaderFileInput?.files?.length > 0;
                 hasPartition = partitionFileInput?.files?.length > 0;
            }
            // Otherwise, no badges shown if no method is selected

            if (hasApp) { /* ... add badge ... */ }
            if (hasBootloader) { /* ... add badge ... */ }
            if (hasPartition) { /* ... add badge ... */ }
            // --- (No changes needed inside the badge adding logic itself) ---
            if (hasApp) {
                const appButton = document.querySelector('[data-binary="app"]');
                appButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasBootloader) {
                const bootloaderButton = document.querySelector('[data-binary="bootloader"]');
                 bootloaderButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasPartition) {
                const partitionButton = document.querySelector('[data-binary="partition"]');
                 partitionButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
        }

         // --- Initialize Step 3 View ---
         // Call selectFirmwareMethod initially with null to ensure correct hidden state
         selectFirmwareMethod(null);

    }

    // Add this function to update the modern status indicator
    function updateStatusIndicator(status, message, details) {
        const statusIcon = document.querySelector('.status-icon');
        const statusMessage = document.getElementById('statusMessage');
        const statusDetails = document.getElementById('statusDetails');

        if (statusMessage) statusMessage.textContent = message || 'Ready';
        if (statusDetails) statusDetails.textContent = details || '';

        if (statusIcon) {
            // Reset all classes first
            statusIcon.className = 'bi status-icon';

            // Add appropriate icon class based on status
            switch (status) {
                case 'ready':
                    statusIcon.classList.add('bi-cpu');
                    break;
                case 'flashing':
                    statusIcon.classList.add('bi-lightning-charge');
                    break;
                case 'success':
                    statusIcon.classList.add('bi-check-circle');
                    break;
                case 'error':
                    statusIcon.classList.add('bi-exclamation-triangle');
                    break;
                case 'disconnected':
                    statusIcon.classList.add('bi-x-circle');
                    break;
                default:
                    statusIcon.classList.add('bi-cpu');
            }
        }
    }

    // Add style to ensure visibility of changes
    const style = document.createElement('style');
    style.textContent = `
    .file-uploaded {
        border: 2px solid #5bf13d !important;
        background-color: rgba(91, 241, 61, 0.1) !important;
        transition: all 0.3s ease !important;
    }
    .file-uploaded span {
        color: #5bf13d !important;
        font-weight: 500 !important;
    }
    @keyframes pulse-flashing { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    .status-flashing-anim { animation: pulse-flashing 1.5s infinite; }
    .file-badge {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: var(--success-color, #2ecc71);
        margin-left: 8px;
        vertical-align: middle;
        box-shadow: 0 0 5px var(--success-color, #2ecc71);
    }
    `;
    document.head.appendChild(style);

    // Add a helper to check UI state from console
    window.debugFileInputs = function() {
        ['appFile', 'bootloaderFile', 'partitionFile'].forEach(id => {
            const input = document.getElementById(id);
            const label = document.querySelector(`label[for="${id}"] span`);
            const info = document.getElementById(id + 'Info');
            const dropZone = document.querySelector(`label[for="${id}"]`);

            console.log(`${id}:`, {
                hasFiles: input?.files?.length > 0,
                fileName: input?.files?.[0]?.name,
                labelText: label?.innerHTML,
                infoText: info?.textContent,
                dropZoneHasClass: dropZone?.classList.contains('file-uploaded')
            });
        });
        console.log("Has Firmware Selected:", hasFirmwareFilesSelected());
        console.log("Connected:", connected);
    };

    // Also add this global debug function
    window.checkAllFileInputs = function() {
        const fileInputs = ['appFile', 'bootloaderFile', 'partitionFile'];
        fileInputs.forEach(id => {
            const input = document.getElementById(id);
            console.log(id, "has files:", input?.files?.length > 0,
                        input?.files?.[0]?.name || "none");
        });
    };

});