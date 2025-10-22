/**
 * Arkiv Plugin for Draw.io (Built-in Version)
 * Pre-configured for drawiodb.online backend
 * With MetaMask Authentication and Encryption Support
 */
(function() {
    'use strict';

    // Cache busting - force reload when plugin changes
    const PLUGIN_VERSION = Date.now();
    console.log(`🔄 Arkiv Plugin v${PLUGIN_VERSION} loading...`);

    // Library loading system with cache busting
    const LIBRARIES = {
        cryptoJS: {
            url: `https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js?v=${PLUGIN_VERSION}`,
            test: () => typeof CryptoJS !== 'undefined',
            integrity: 'sha512-a+SUDuwNzXDvz4XrIcXHuCf089/iJAoN4lmrXJg18XnduKK6YlDHNRalv4yd1N40OKI80tFidF+rqTFKGPoWFQ=='
        },
        ethers: {
            url: `https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js?v=${PLUGIN_VERSION}`,
            test: () => typeof ethers !== 'undefined'
        },
        arkivSDK: {
            url: `https://unpkg.com/arkiv-sdk@latest/dist/index.js?v=${PLUGIN_VERSION}`,
            test: () => typeof window.arkiv_sdk !== 'undefined'
        }
    };

    // Load external library
    function loadExternalLibrary(name) {
        return new Promise((resolve, reject) => {
            const lib = LIBRARIES[name];
            if (!lib) {
                reject(new Error(`Unknown library: ${name}`));
                return;
            }

            if (lib.test()) {
                console.log(`✅ ${name} already loaded`);
                resolve();
                return;
            }

            console.log(`📦 Loading ${name} library...`);
            const script = document.createElement('script');
            script.src = lib.url;
            if (lib.integrity) script.integrity = lib.integrity;
            script.crossOrigin = 'anonymous';

            script.onload = () => {
                if (lib.test()) {
                    console.log(`✅ ${name} loaded successfully`);
                    resolve();
                } else {
                    reject(new Error(`${name} failed to load properly`));
                }
            };

            script.onerror = () => reject(new Error(`Failed to load ${name}`));
            document.head.appendChild(script);
        });
    }

    // Load required libraries
    async function loadAllLibraries() {
        try {
            await loadExternalLibrary('cryptoJS');
            await loadExternalLibrary('ethers');
            await loadExternalLibrary('arkivSDK');
            console.log('🎉 All libraries loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load libraries:', error);
            return false;
        }
    }

    // Golem Network Configuration (matched to actual RPC chain ID)
    const ARKIV_CONFIG = {
        chainId: 60138453025, // Kaolin RPC actual chain ID (0xe0087f821)
        chainIdHex: '0xe0087f821',
        rpcUrl: 'https://kaolin.hoodi.arkiv.network/rpc',
        wsUrl: 'wss://https://kaolin.hoodi.arkiv.network/rpc/rpc/ws',
        explorerUrl: 'https://explorer.https://kaolin.hoodi.arkiv.network/rpc',
        name: 'Arkiv Kaolin Testnet'
    };

    // Use relative path for integrated backend
    const BACKEND_URL = 'http://moon.dev.golem.network:8900';

    // SDK state
    let arkivClient = null;
    let isSDKMode = true; // Try SDK mode first with correct dPaste config

    console.log('🔥🔥🔥 GOLEM DB PLUGIN SCRIPT LOADED!');

    console.log('🔥 Initializing Built-in Arkiv Plugin with MetaMask Auth...');
    console.log('🌐 Backend URL:', BACKEND_URL);

    // MetaMask faux error detection (from dPaste example)
    function isFauxError(error) {
        if (!error || !error.message) return false;
        const fauxMessages = [
            'is not a function',
            'Cannot read property',
            'Cannot read properties of undefined'
        ];
        return fauxMessages.some(msg => error.message.includes(msg));
    }

    // Wait for Draw.io to be fully ready
    function waitForDrawIO(callback) {
        if (typeof Draw !== 'undefined' && Draw.loadPlugin) {
            callback();
        } else {
            setTimeout(() => waitForDrawIO(callback), 100);
        }
    }

    waitForDrawIO(function() {
        console.log('✅ Draw.io ready, loading Arkiv plugin...');

        // Check for diagram parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const diagramId = urlParams.get('diagram');

        if (diagramId) {
            console.log(`🔗 Found diagram parameter: ${diagramId}, will auto-load after plugin initialization`);
        }

        // Load the plugin
        Draw.loadPlugin(function(ui) {
            console.log('🎯 Arkiv Plugin UI context loaded');

            // ===== MODAL SYSTEM =====
            function createModal(title, message, buttons = [{ text: 'OK', style: 'primary' }]) {
                return new Promise((resolve) => {
                    // Remove any existing modal
                    const existingModal = document.querySelector('.golem-modal-overlay');
                    if (existingModal) {
                        existingModal.remove();
                    }

                    // Create modal
                    const modal = document.createElement('div');
                    modal.className = 'golem-modal-overlay';
                    modal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.6);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 30000;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    `;

                    const modalContent = document.createElement('div');
                    modalContent.style.cssText = `
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        max-width: 500px;
                        width: 90%;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                        text-align: center;
                        animation: modalSlideIn 0.3s ease-out;
                    `;

                    // Add CSS animations if not already present
                    if (!document.querySelector('#golem-modal-animations')) {
                        const style = document.createElement('style');
                        style.id = 'golem-modal-animations';
                        style.textContent = `
                            @keyframes modalSlideIn {
                                from { transform: translateY(-50px) scale(0.9); opacity: 0; }
                                to { transform: translateY(0) scale(1); opacity: 1; }
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    function escapeHtml(text) {
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
                    }

                    modalContent.innerHTML = `
                        <h3 style="margin-top: 0; color: #333; font-size: 1.4em; margin-bottom: 20px;">${escapeHtml(title)}</h3>
                        <p style="margin: 20px 0; color: #666; line-height: 1.6; white-space: pre-wrap; font-size: 14px;">${escapeHtml(message)}</p>
                        <div style="margin-top: 30px;">
                            ${buttons.map((button, index) => {
                                const style = button.style === 'secondary'
                                    ? 'background: #6c757d; color: white;'
                                    : button.style === 'danger'
                                    ? 'background: #dc3545; color: white;'
                                    : 'background: #007bff; color: white;';
                                return `<button data-button-index="${index}" style="${style} border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 0 5px; font-weight: 500; font-size: 14px;">${escapeHtml(button.text)}</button>`;
                            }).join('')}
                        </div>
                    `;

                    modal.appendChild(modalContent);
                    document.body.appendChild(modal);

                    // Handle button clicks
                    modalContent.addEventListener('click', (e) => {
                        if (e.target.hasAttribute('data-button-index')) {
                            const buttonIndex = parseInt(e.target.getAttribute('data-button-index'));
                            modal.remove();
                            resolve(buttonIndex);
                        }
                    });

                    // Close on background click
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.remove();
                            resolve(-1); // Cancelled
                        }
                    });
                });
            }

            async function showAlert(title, message) {
                await createModal(title, message, [{ text: 'OK', style: 'primary' }]);
            }

            async function showConfirm(title, message) {
                const result = await createModal(title, message, [
                    { text: 'Cancel', style: 'secondary' },
                    { text: 'OK', style: 'primary' }
                ]);
                return result === 1; // True if OK was clicked
            }

            // Special confirm dialog for encryption with better button order
            async function showEncryptionConfirm(title, message) {
                const result = await createModal(title, message, [
                    { text: 'Yes', style: 'primary' },
                    { text: 'No', style: 'secondary' }
                ]);
                return result === 0; // True if Yes was clicked
            }

            async function showPrompt(title, message, defaultValue = '') {
                return new Promise((resolve) => {
                    // Remove any existing modal
                    const existingModal = document.querySelector('.golem-modal-overlay');
                    if (existingModal) {
                        existingModal.remove();
                    }

                    // Create modal
                    const modal = document.createElement('div');
                    modal.className = 'golem-modal-overlay';
                    modal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.6);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 30000;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    `;

                    const modalContent = document.createElement('div');
                    modalContent.style.cssText = `
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        max-width: 500px;
                        width: 90%;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                        text-align: center;
                        animation: modalSlideIn 0.3s ease-out;
                    `;

                    function escapeHtml(text) {
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
                    }

                    modalContent.innerHTML = `
                        <h3 style="margin-top: 0; color: #333; font-size: 1.4em; margin-bottom: 20px;">${escapeHtml(title)}</h3>
                        <p style="margin: 20px 0; color: #666; line-height: 1.6; font-size: 14px;">${escapeHtml(message)}</p>
                        <input type="text" id="promptInput" value="${escapeHtml(defaultValue)}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; margin: 10px 0; font-size: 14px;">
                        <div style="margin-top: 30px;">
                            <button data-button-action="cancel" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 0 5px; font-weight: 500; font-size: 14px;">Cancel</button>
                            <button data-button-action="ok" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 0 5px; font-weight: 500; font-size: 14px;">OK</button>
                        </div>
                    `;

                    modal.appendChild(modalContent);
                    document.body.appendChild(modal);

                    const input = modalContent.querySelector('#promptInput');
                    input.focus();
                    input.select();

                    function handleResult(success) {
                        const value = success ? input.value : null;
                        modal.remove();
                        resolve(value);
                    }

                    // Handle button clicks
                    modalContent.addEventListener('click', (e) => {
                        const action = e.target.getAttribute('data-button-action');
                        if (action === 'ok') {
                            handleResult(true);
                        } else if (action === 'cancel') {
                            handleResult(false);
                        }
                    });

                    // Handle Enter key
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            handleResult(true);
                        } else if (e.key === 'Escape') {
                            handleResult(false);
                        }
                    });

                    // Close on background click
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            handleResult(false);
                        }
                    });
                });
            }

            // ===== ENCRYPTION HELPER FUNCTIONS =====
            function encryptContent(content, password) {
                try {
                    if (typeof CryptoJS === 'undefined') {
                        throw new Error('CryptoJS library not loaded');
                    }
                    const encrypted = CryptoJS.AES.encrypt(content, password).toString();
                    console.log('🔐 Content encrypted successfully');
                    return encrypted;
                } catch (error) {
                    console.error('❌ Encryption failed:', error);
                    throw new Error('Encryption failed: ' + error.message);
                }
            }

            function decryptContent(encryptedContent, password) {
                try {
                    if (typeof CryptoJS === 'undefined') {
                        throw new Error('CryptoJS library not loaded');
                    }
                    const decrypted = CryptoJS.AES.decrypt(encryptedContent, password);
                    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

                    if (!plaintext) {
                        throw new Error('Decryption failed - invalid password or corrupted data');
                    }

                    console.log('🔓 Content decrypted successfully');
                    return plaintext;
                } catch (error) {
                    console.error('❌ Decryption failed:', error);
                    throw new Error('Decryption failed - invalid password');
                }
            }

            // Check if content appears to be encrypted (basic heuristic)
            function looksEncrypted(content) {
                // CryptoJS encrypted content usually starts with base64-like pattern
                return typeof content === 'string' &&
                       content.length > 50 &&
                       /^[A-Za-z0-9+/]/.test(content) &&
                       !content.includes('<') && // XML typically contains <
                       !content.includes('>');
            }

            // ===== GOLEM SDK FUNCTIONS =====
            async function initializeGolemSDK() {
                try {
                    // First ensure all libraries are loaded
                    const librariesLoaded = await loadAllLibraries();
                    if (!librariesLoaded) {
                        throw new Error('Failed to load required libraries');
                    }

                    if (!window.ethereum) {
                        throw new Error('MetaMask not found');
                    }

                    if (typeof window.arkiv_sdk === 'undefined') {
                        throw new Error('Golem SDK not loaded');
                    }

                    console.log('🔄 Initializing Golem SDK...');

                    // Check if Golem network is configured in MetaMask
                    await ensureGolemNetwork();

                    const provider = window.ethereum;
                    const sdk = window.arkiv_sdk;

                    // Explore what the SDK has available for web3 integration
                    console.log('🔍 Exploring Golem SDK capabilities...');
                    console.log('SDK keys:', Object.keys(sdk));

                    // Debug provider details
                    console.log('🔍 MetaMask provider details:');
                    console.log('- isMetaMask:', provider.isMetaMask);
                    console.log('- chainId:', await provider.request({ method: 'eth_chainId' }));
                    console.log('- accounts:', await provider.request({ method: 'eth_accounts' }));

                    // Ensure we have permission to use the active account
                    const accounts = await provider.request({ method: 'eth_requestAccounts' });
                    const activeAddress = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;

                    if (activeAddress) {
                        walletAddress = activeAddress;
                        lastWalletAddress = activeAddress;
                        walletConnected = true;
                    }

                    ethersProviderInstance = new ethers.providers.Web3Provider(provider);
                    ethersSignerInstance = ethersProviderInstance.getSigner();
                    const address = activeAddress || await ethersSignerInstance.getAddress();

                    console.log(`🔐 MetaMask wallet: ${address}`);

                    const accountData = new sdk.Tagged('ethereumprovider', provider);
                    arkivClient = await sdk.createClient(
                        ARKIV_CONFIG.chainId,
                        accountData,
                        ARKIV_CONFIG.rpcUrl,
                        ARKIV_CONFIG.wsUrl
                    );

                    console.log('✅ Golem SDK initialized with MetaMask signer');

                    // Test network connectivity
                    try {
                        const blockNumber = await arkivClient.getRawClient().httpClient.getBlockNumber();
                        console.log(`🔗 Connected to Golem network, current block: ${blockNumber}`);
                    } catch (netError) {
                        console.warn('⚠️ Network connectivity test failed:', netError);
                    }

                    isSDKMode = true;
                    return true;
                } catch (error) {
                    console.error('❌ Failed to initialize Golem SDK:', error);
                    isSDKMode = false;
                    return false;
                }
            }

            async function ensureGolemNetwork() {
                try {
                    // Check if we're on the correct network
                    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
                    const expectedChainId = ARKIV_CONFIG.chainIdHex;

                    if (currentChainId !== expectedChainId) {
                        console.log(`🔄 Switching to Golem network (${ARKIV_CONFIG.name})...`);

                        try {
                            // Try to switch to the network
                            await window.ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: expectedChainId }],
                            });
                        } catch (switchError) {
                            // Network doesn't exist, add it
                            if (switchError.code === 4902) {
                                await window.ethereum.request({
                                    method: 'wallet_addEthereumChain',
                                    params: [{
                                        chainId: ARKIV_CONFIG.chainIdHex,
                                        chainName: ARKIV_CONFIG.name,
                                        rpcUrls: [ARKIV_CONFIG.rpcUrl],
                                        blockExplorerUrls: [ARKIV_CONFIG.explorerUrl],
                                        nativeCurrency: {
                                            name: 'GLM',
                                            symbol: 'GLM',
                                            decimals: 18
                                        }
                                    }]
                                });
                            } else {
                                throw switchError;
                            }
                        }
                    }

                    console.log('✅ Golem network configured in MetaMask');
                    return true;
                } catch (error) {
                    console.error('❌ Failed to configure Golem network:', error);
                    if (!isFauxError(error)) {
                        throw new Error(`Failed to configure Golem network: ${error.message}`);
                    }
                }
            }

            async function checkSDKMode() {
                // Always use backend mode for now since testnet RPC has issues
                console.log('🔄 Using backend mode (SDK disabled due to testnet RPC issues)');
                return false;
            }

            // Initialize our custom Arkiv SDK
            let golemDB = null;

            async function initGolemDB() {
                if (!golemDB) {
                    golemDB = new window.GolemDB({
                        rpcUrl: 'https://kaolin.hoodi.arkiv.network/rpc',
                        chainId: 0xE0087F821
                    });
                    await golemDB.connect();
                    console.log('🔗 Custom Arkiv SDK initialized');
                }
                return golemDB;
            }

            // Save diagram using our custom SDK
            async function saveToGolemDBViaSdk(xmlString, diagramId, title, author, encrypted = false) {
                try {
                    console.log(`📦 Saving diagram via custom Arkiv SDK (${Math.round(xmlString.length/1024)}KB)`);

                    const db = await initGolemDB();

                    // Prepare diagram data
                    const diagramData = {
                        id: diagramId,
                        title: title,
                        author: author,
                        content: xmlString,
                        timestamp: Date.now(),
                        version: 1,
                        encrypted: encrypted
                    };

                    const annotations = {
                        type: 'diagram',
                        id: diagramId,
                        title: title,
                        author: author,
                        wallet: db.getAccount().address,
                        timestamp: Date.now().toString(),
                        version: '1',
                        encrypted: encrypted ? '1' : '0'
                    };

                    // Calculate BTL - default 100 days
                    const btlDays = userConfig?.btlDays || 100;
                    const btlBlocks = db.calculateBTL(btlDays);

                    const result = await db.createEntity(
                        JSON.stringify(diagramData),
                        annotations,
                        btlBlocks
                    );

                    console.log(`✅ Diagram saved with entity key: ${result.entityKey}`);

                    return {
                        success: true,
                        diagramId: diagramId,
                        entityKey: result.entityKey,
                        transactionHash: result.transactionHash,
                        blockNumber: result.blockNumber
                    };

                } catch (error) {
                    console.error('❌ Save failed:', error);
                    throw error;
                }
            }

            async function loadFromGolemSDK(diagramId) {
                try {
                    if (!arkivClient) {
                        throw new Error('Golem SDK not initialized');
                    }

                    console.log(`📥 Loading diagram ${diagramId} from Arkiv via SDK...`);

                    // Use entity key directly (diagramId is the entity key)
                    try {
                        const storageValue = await arkivClient.getStorageValue(diagramId);

                        if (!storageValue) {
                            throw new Error('Diagram not found or empty');
                        }

                        // Decode the storage value
                        const decoder = new TextDecoder();
                        const decodedData = decoder.decode(storageValue);
                        const diagramData = JSON.parse(decodedData);
                    } catch (entityError) {
                        console.log(`⚠️ Direct entity access failed, trying fallback: ${entityError.message}`);
                        throw new Error(`Diagram not found: ${entityError.message}`);
                    }

                    console.log(`✅ Diagram loaded from SDK: ${diagramData.title}`);
                    return {
                        success: true,
                        data: diagramData,
                        mode: 'sdk'
                    };
                } catch (error) {
                    console.error('❌ SDK load failed:', error);
                    throw error;
                }
            }

            async function listFromGolemSDK() {
                try {
                    if (!arkivClient) {
                        throw new Error('Golem SDK not initialized');
                    }

                    console.log('📋 Listing diagrams from Arkiv via SDK...');

                    // SDK doesn't have query API for listing - use backend instead
                    throw new Error('Listing via SDK not supported - use backend mode');

                    // Sort by timestamp (newest first)
                    diagrams.sort((a, b) => b.timestamp - a.timestamp);

                    console.log(`✅ Found ${diagrams.length} diagrams via SDK`);
                    return {
                        success: true,
                        data: diagrams,
                        mode: 'sdk'
                    };
                } catch (error) {
                    console.error('❌ SDK list failed:', error);
                    throw error;
                }
            }

            // Wallet connection state
            let walletConnected = false;
            let walletAddress = null;

            // SDK state variables
            let arkivClient = null;
            let ethersProviderInstance = null;
            let ethersSignerInstance = null;
            let isSDKMode = true; // Try SDK mode with dPaste config

            // Create wallet status display
            function createWalletStatusDisplay() {
                const statusDiv = document.createElement('div');
                statusDiv.id = 'golem-wallet-status';
                statusDiv.style.cssText = `
                    position: fixed;
                    bottom: 40px;
                    left: 10px;
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 8px;
                    font-size: 12px;
                    z-index: 10000;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                `;
                document.body.appendChild(statusDiv);
                return statusDiv;
            }

            // Update wallet status display - DISABLED
            function updateWalletStatus() {
                // Status display disabled - no visual box needed
                return;
            }

            // Initialize MetaMask connection
            async function connectWallet() {
                if (typeof window.ethereum === 'undefined') {
                    await showAlert('❌ MetaMask Required', 'MetaMask is not installed. Please install MetaMask extension to use Arkiv features.\n\nVisit: https://metamask.io');
                    return false;
                }

                // Load required libraries first
                const librariesLoaded = await loadAllLibraries();
                if (!librariesLoaded) {
                    await showAlert('❌ Libraries Failed', 'Failed to load required libraries for Arkiv integration.');
                    return false;
                }

                try {
                    console.log('🔄 Requesting MetaMask connection...');
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

                    if (accounts.length === 0) {
                        await showAlert('⚠️ No Accounts', 'No MetaMask accounts found. Please create an account first.');
                        return false;
                    }

                    walletAddress = accounts[0];
                    lastWalletAddress = walletAddress;
                    walletConnected = true;

                    console.log('✅ Wallet connected:', walletAddress);

                    // Setup wallet change detection
                    setupWalletChangeDetection();

                    // Check backend connectivity
                    const backendHealthy = await checkBackendHealth();
                    if (!backendHealthy) {
                        await showAlert('⚠️ Backend Offline', `Backend server (${BACKEND_URL}) appears to be offline.\n\nWallet connected but Arkiv features may not work.`);
                    }

                    // Załaduj konfigurację użytkownika i balance
                    await loadUserConfig();
                    await updateEthBalance();

                    await showAlert('✅ Wallet Connected', `Address: ${walletAddress}\n\nYou can now save and load diagrams from Arkiv.`);
                    return true;
                } catch (error) {
                    console.error('❌ Error connecting wallet:', error);

                    let errorMessage = 'Failed to connect wallet.';
                    if (error.code === 4001) {
                        errorMessage = 'Connection rejected by user.';
                    } else if (error.code === -32002) {
                        errorMessage = 'Connection request already pending. Please check MetaMask.';
                    }

                    await showAlert('❌ Connection Failed', `${errorMessage}\n\nError: ${error.message}`);
                    return false;
                }
            }

            // Disconnect wallet
            async function disconnectWallet() {
                walletConnected = false;
                walletAddress = null;
                await showAlert('🔓 Wallet Disconnected', 'You can no longer save/load from Arkiv until reconnected.');
            }

            // User configuration state
            let userConfig = null;
            let ethBalance = '0';
            let isOperationInProgress = false;
            let lastWalletAddress = null;
            let encryptionEnabled = false;
            let defaultEncryptionPassword = null;

            // Utility function for fetch with timeout
            async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    if (error.name === 'AbortError') {
                        throw new Error('Request timeout - server might be unavailable');
                    }
                    throw error;
                }
            }

            // Check backend connectivity
            async function checkBackendHealth() {
                try {
                    const response = await fetchWithTimeout(`${BACKEND_URL}/health`, {}, 5000);
                    return response.ok;
                } catch (error) {
                    console.error('Backend health check failed:', error);
                    return false;
                }
            }

            // Arkiv constants
            const GOLEM_DB_MAX_SIZE = 128 * 1024; // 128KB Arkiv entity limit
            const CHUNK_SIZE = 100 * 1024; // 100KB chunks for safety margin
            const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total document limit

            // Validate document size (check against total limit)
            function validateDocumentSize(xmlString) {
                const sizeInBytes = new Blob([xmlString]).size;
                if (sizeInBytes > MAX_TOTAL_SIZE) {
                    throw new Error(`Document too large (${Math.round(sizeInBytes/1024/1024)}MB). Maximum size is ${Math.round(MAX_TOTAL_SIZE/1024/1024)}MB.`);
                }
                return true;
            }

            // Split document into chunks for Arkiv storage
            function createDocumentChunks(xmlString, diagramId, title, author) {
                const encoder = new TextEncoder();
                const xmlBytes = encoder.encode(xmlString);
                const chunks = [];

                const chunkCount = Math.ceil(xmlBytes.length / CHUNK_SIZE);
                console.log(`📦 Splitting document into ${chunkCount} chunks (${xmlBytes.length} bytes total)`);

                for (let i = 0; i < chunkCount; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, xmlBytes.length);
                    const chunkData = xmlBytes.slice(start, end);

                    const chunkId = `${diagramId}_chunk_${i}`;

                    chunks.push({
                        chunkId,
                        diagramId,
                        title,
                        author,
                        chunkIndex: i,
                        totalChunks: chunkCount,
                        data: chunkData,
                        dataSize: chunkData.length,
                        isLastChunk: i === chunkCount - 1
                    });
                }

                return chunks;
            }

            // Reconstruct document from chunks
            function reconstructDocumentFromChunks(chunks) {
                console.log(`🔧 Reconstructing document from ${chunks.length} chunks`);

                // Sort chunks by index to ensure correct order
                chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

                // Verify we have all chunks
                const expectedChunks = chunks[0]?.totalChunks || chunks.length;
                if (chunks.length !== expectedChunks) {
                    throw new Error(`Missing chunks: found ${chunks.length}, expected ${expectedChunks}`);
                }

                // Verify chunk sequence
                for (let i = 0; i < chunks.length; i++) {
                    if (chunks[i].chunkIndex !== i) {
                        throw new Error(`Chunk sequence error: expected index ${i}, found ${chunks[i].chunkIndex}`);
                    }
                }

                // Combine all chunk data
                const totalSize = chunks.reduce((sum, chunk) => sum + chunk.dataSize, 0);
                const combinedArray = new Uint8Array(totalSize);
                let offset = 0;

                for (const chunk of chunks) {
                    combinedArray.set(chunk.data, offset);
                    offset += chunk.dataSize;
                }

                // Decode back to string
                const decoder = new TextDecoder();
                return decoder.decode(combinedArray);
            }

            // Detect MetaMask account changes
            function setupWalletChangeDetection() {
                if (typeof window.ethereum !== 'undefined') {
                    window.ethereum.on('accountsChanged', async function (accounts) {
                        if (walletConnected && accounts.length > 0) {
                            const newAddress = accounts[0];
                            if (lastWalletAddress && newAddress !== lastWalletAddress) {
                                console.log('🔄 MetaMask account changed:', newAddress);
                                walletAddress = newAddress;
                                lastWalletAddress = newAddress;

                                // Reset SDK instances to use new account
                                console.log('🔄 Resetting SDK for new account...');
                                arkivClient = null;
                                ethersProviderInstance = null;
                                ethersSignerInstance = null;

                                // Reinitialize SDK with new account
                                if (isSDKMode) {
                                    await initializeGolemSDK();
                                }

                                // Reload user config for new account
                                loadUserConfig();
                                updateEthBalance();

                                await showAlert('🔄 Account Changed', `New address: ${newAddress}\n\nUser configuration reloaded.`);
                            }
                        } else if (walletConnected && accounts.length === 0) {
                            // User disconnected wallet
                            await disconnectWallet();
                        }
                    });

                    window.ethereum.on('chainChanged', async function (chainId) {
                        console.log('🌐 Network changed:', chainId);
                        await showAlert('🌐 Network Changed', 'Network changed in MetaMask. Please refresh the page if you experience issues.');
                    });
                }
            }

            // Prevent concurrent operations
            function withOperationLock(asyncFn) {
                return async function(...args) {
                    if (isOperationInProgress) {
                        await showAlert('⏳ Operation in Progress', 'Another operation is in progress. Please wait...');
                        return;
                    }

                    isOperationInProgress = true;
                    try {
                        return await asyncFn.apply(this, args);
                    } finally {
                        isOperationInProgress = false;
                    }
                };
            }

            // Global functions for buttons
            window.golemConnectWallet = connectWallet;
            window.golemDisconnectWallet = disconnectWallet;

            // Check wallet connection
            async function checkWallet() {
                if (!walletConnected) {
                    const shouldConnect = await showConfirm('🔐 Wallet Required', 'You need to connect your MetaMask wallet to save/load diagrams from Arkiv.\n\nConnect now?');
                    if (!shouldConnect) return false;

                    const connected = await connectWallet();
                    if (!connected) return false;
                }
                return true;
            }

            // Save current diagram to Arkiv with sharding support
            const saveToGolemDB = withOperationLock(async function() {
                try {
                    if (!(await checkWallet())) return;

                    const title = await showPrompt('📝 Enter Title', 'Enter diagram title:', 'My Diagram');
                    if (!title) return;

                    // Ask about encryption if not enabled by default
                    let encryptThisDiagram = encryptionEnabled;
                    let encryptionPassword = defaultEncryptionPassword;

                    if (!encryptionEnabled) {
                        encryptThisDiagram = await showEncryptionConfirm('🔐 Encryption', 'Do you want to encrypt this diagram?\n\nEncrypted diagrams require a password to open.');
                    }

                    if (encryptThisDiagram && !encryptionPassword) {
                        encryptionPassword = await showPrompt('🔐 Encryption Password', 'Enter encryption password:', '');
                        if (!encryptionPassword) {
                            await showAlert('❌ Encryption Required', 'Encryption password is required. Diagram will be saved without encryption.');
                            encryptThisDiagram = false;
                        }
                    }

                    if (title.length > 100) {
                        await showAlert('❌ Title Too Long', 'Maximum 100 characters allowed.');
                        return;
                    }

                    const xml = ui.editor.getGraphXml();
                    let xmlString = mxUtils.getXml(xml);

                    // Encrypt content if requested
                    if (encryptThisDiagram && encryptionPassword) {
                        try {
                            xmlString = encryptContent(xmlString, encryptionPassword);
                            console.log('🔐 Diagram content encrypted before saving');
                        } catch (encryptError) {
                            await showAlert('❌ Encryption Failed', `Failed to encrypt diagram: ${encryptError.message}`);
                            return;
                        }
                    }

                    // Validate document size
                    try {
                        validateDocumentSize(xmlString);
                    } catch (sizeError) {
                        await showAlert('❌ Document Too Large', sizeError.message);
                        return;
                    }

                    const diagramId = generateDiagramId();
                    const sizeInBytes = new Blob([xmlString]).size;

                    // Try SDK mode first with dPaste config, fallback to backend
                    try {
                        // Ensure correct network first
                        await ensureGolemNetwork();

                        const sdkAvailable = await checkSDKMode();
                        if (sdkAvailable) {
                            console.log('🚀 Using SDK mode with dPaste configuration');
                            const result = await saveToGolemDBViaSdk(xmlString, diagramId, title.trim(), walletAddress, encryptThisDiagram);
                            await showAlert('✅ Diagram Saved', `Diagram saved directly to Arkiv!\n\nDiagram ID: ${result.diagramId}\nMode: Direct SDK\nEntity Key: ${result.entityKey?.substring(0, 16)}...`);
                            return;
                        }
                    } catch (sdkError) {
                        console.warn('⚠️ SDK save failed, falling back to backend:', sdkError);
                        await showAlert('⚠️ SDK Failed', `Direct posting failed: ${sdkError.message}\n\nFalling back to backend mode...`);
                    }

                    // Fallback to backend mode
                    console.log('🔄 Using backend mode');
                    if (sizeInBytes > GOLEM_DB_MAX_SIZE) {
                        console.log(`📦 Document size ${Math.round(sizeInBytes/1024)}KB exceeds 128KB limit, using sharding...`);
                        await saveShardedDocument(xmlString, diagramId, title.trim(), walletAddress, encryptThisDiagram, encryptionPassword);
                    } else {
                        console.log(`💾 Document size ${Math.round(sizeInBytes/1024)}KB fits in single entity`);
                        await saveSingleDocument(xmlString, diagramId, title.trim(), walletAddress, encryptThisDiagram, encryptionPassword);
                    }

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Save error:', error);

                    let errorMsg = error.message;
                    if (errorMsg.includes('timeout')) {
                        errorMsg += '\n\nTry again or check your internet connection.';
                    }

                    await showAlert('❌ Save Failed', errorMsg);
                }
            });

            // Save single document (under 128KB)
            async function saveSingleDocument(xmlString, diagramId, title, author, encrypted = false, encryptionPassword = null) {
                const saveData = {
                    title,
                    author,
                    content: xmlString,
                    diagramId,
                    encrypted
                };

                // Add encryption password for backend processing
                if (encrypted && encryptionPassword) {
                    saveData.encryptionPassword = encryptionPassword;
                }

                ui.spinner.spin(document.body, 'Saving to Arkiv...');

                const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/export`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Wallet-Address': walletAddress
                    },
                    body: JSON.stringify(saveData)
                }, 30000);

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                ui.spinner.stop();

                if (result.success) {
                    await showAlert('✅ Diagram Saved', `Diagram saved to Arkiv!\n\nDiagram ID: ${result.diagramId}`);
                } else {
                    throw new Error(result.error || 'Save failed');
                }
            }

            // Save sharded document (over 128KB)
            async function saveShardedDocument(xmlString, diagramId, title, author, encrypted = false, encryptionPassword = null) {
                const chunks = createDocumentChunks(xmlString, diagramId, title, author);

                ui.spinner.spin(document.body, `Saving ${chunks.length} chunks to Arkiv...`);

                console.log(`💾 Saving ${chunks.length} chunks for diagram ${diagramId}`);

                try {
                    // Save all chunks
                    const chunkResults = [];
                    for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i];

                        // Update progress
                        ui.spinner.spin(document.body, `Saving chunk ${i + 1}/${chunks.length} to Arkiv...`);

                        const chunkData = {
                            chunkId: chunk.chunkId,
                            diagramId: chunk.diagramId,
                            title: chunk.title,
                            author: chunk.author,
                            chunkIndex: chunk.chunkIndex,
                            totalChunks: chunk.totalChunks,
                            content: Array.from(chunk.data), // Convert Uint8Array to regular array for JSON
                            isLastChunk: chunk.isLastChunk,
                            encrypted
                        };

                        // Add encryption password for backend processing
                        if (encrypted && encryptionPassword) {
                            chunkData.encryptionPassword = encryptionPassword;
                        }

                        const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/export-chunk`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Wallet-Address': walletAddress
                            },
                            body: JSON.stringify(chunkData)
                        }, 45000); // Longer timeout for chunks

                        if (!response.ok) {
                            throw new Error(`Failed to save chunk ${i + 1}: ${response.status} ${response.statusText}`);
                        }

                        const result = await response.json();
                        if (!result.success) {
                            throw new Error(`Chunk ${i + 1} save failed: ${result.error}`);
                        }

                        chunkResults.push(result);
                        console.log(`✅ Chunk ${i + 1}/${chunks.length} saved successfully`);
                    }

                    ui.spinner.stop();

                    await showAlert('✅ Large Diagram Saved', `Large diagram saved to Arkiv!\n\nDiagram ID: ${diagramId}\nChunks: ${chunks.length}\nTotal size: ${Math.round(new Blob([xmlString]).size/1024)}KB`);

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Sharded save error:', error);
                    throw error;
                }
            }

            // Generate diagram ID
            function generateDiagramId() {
                return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
            }

            // Show diagram selection dialog with UI
            function showDiagramDialog(diagrams) {
                // Create overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

                // Create dialog
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80%;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                `;

                // Create header
                const header = document.createElement('div');
                header.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                `;

                const title = document.createElement('h3');
                title.textContent = 'Select Diagram';
                title.style.margin = '0';

                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '✖';
                closeBtn.style.cssText = `
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #666;
                `;
                closeBtn.onclick = () => document.body.removeChild(overlay);

                header.appendChild(title);
                header.appendChild(closeBtn);

                // Create diagram list
                const diagramList = document.createElement('div');

                diagrams.forEach((diagram, index) => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        margin-bottom: 8px;
                        background: #f9f9f9;
                        cursor: pointer;
                        transition: background 0.2s;
                    `;

                    const info = document.createElement('div');
                    info.style.cssText = `flex: 1; cursor: pointer;`;
                    info.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 4px;">${diagram.title}</div>
                        <div style="font-size: 12px; color: #666;">
                            ${new Date(diagram.timestamp).toLocaleDateString()} ${new Date(diagram.timestamp).toLocaleTimeString()}
                            ${diagram.entityKey ? `| Entity: ${diagram.entityKey.substring(0, 10)}...` : ''}
                        </div>
                    `;

                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = '🗑️';
                    deleteBtn.title = 'Delete diagram';
                    deleteBtn.style.cssText = `
                        background: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 8px 12px;
                        cursor: pointer;
                        font-size: 16px;
                        margin-left: 10px;
                        transition: background 0.2s;
                    `;

                    // Add Explorer button for non-sharded diagrams
                    const explorerBtn = document.createElement('button');
                    if (diagram.entityKey && !diagram.entityKey.startsWith('sharded:')) {
                        explorerBtn.innerHTML = '🔍';
                        explorerBtn.title = `View in ${ARKIV_CONFIG.name} Explorer`;
                        explorerBtn.style.cssText = `
                            background: #17a2b8;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            padding: 8px 12px;
                            cursor: pointer;
                            font-size: 16px;
                            margin-left: 10px;
                            transition: background 0.2s;
                        `;
                        explorerBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.open(`${ARKIV_CONFIG.explorerUrl}/entity/${diagram.entityKey}?tab=data`, '_blank');
                        };
                    }

                    // Load diagram on click
                    info.onclick = () => {
                        document.body.removeChild(overlay);
                        loadDiagram(diagram);
                    };

                    // Delete diagram on button click
                    deleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        const confirmDelete = await showConfirm('⚠️ Delete Diagram?', `Title: ${diagram.title}\nSaved: ${new Date(diagram.timestamp).toLocaleDateString()} ${new Date(diagram.timestamp).toLocaleTimeString()}\n\nThis action cannot be undone!`);
                        if (confirmDelete) {
                            document.body.removeChild(overlay);
                            deleteDiagram(diagram.id);
                        }
                    };

                    // Add Share button
                    const shareBtn = document.createElement('button');
                    shareBtn.innerHTML = '📤';
                    shareBtn.title = 'Share diagram';
                    shareBtn.style.cssText = `
                        background: #28a745;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 8px 12px;
                        cursor: pointer;
                        font-size: 16px;
                        margin-left: 10px;
                        transition: background 0.2s;
                    `;
                    shareBtn.onclick = (e) => {
                        e.stopPropagation();
                        shareDiagram(diagram);
                    };

                    // Hover effects
                    item.onmouseenter = () => {
                        item.style.background = '#e9ecef';
                        deleteBtn.style.background = '#c82333';
                        shareBtn.style.background = '#218838';
                        if (explorerBtn && diagram.entityKey && !diagram.entityKey.startsWith('sharded:')) {
                            explorerBtn.style.background = '#138496';
                        }
                    };
                    item.onmouseleave = () => {
                        item.style.background = '#f9f9f9';
                        deleteBtn.style.background = '#dc3545';
                        shareBtn.style.background = '#28a745';
                        if (explorerBtn && diagram.entityKey && !diagram.entityKey.startsWith('sharded:')) {
                            explorerBtn.style.background = '#17a2b8';
                        }
                    };

                    item.appendChild(info);
                    if (diagram.entityKey && !diagram.entityKey.startsWith('sharded:')) {
                        item.appendChild(explorerBtn);
                    }
                    item.appendChild(shareBtn);
                    item.appendChild(deleteBtn);
                    diagramList.appendChild(item);
                });

                dialog.appendChild(header);
                dialog.appendChild(diagramList);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // Close on ESC key
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        document.body.removeChild(overlay);
                        document.removeEventListener('keydown', escHandler);
                    }
                });
            }

            // Load diagram function
            async function loadDiagram(selectedDiagram) {
                try {
                    ui.spinner.spin(document.body, 'Loading diagram...');

                    let loadResult;

                    // Try SDK mode first with dPaste config
                    try {
                        await ensureGolemNetwork();
                        const sdkAvailable = await checkSDKMode();
                        if (sdkAvailable) {
                            console.log('🚀 Using SDK mode for loading with dPaste config');
                            loadResult = await loadFromGolemDB(selectedDiagram.id);
                        }
                    } catch (sdkError) {
                        console.warn('⚠️ SDK load failed, falling back to backend:', sdkError);
                    }

                    // Fallback to backend if SDK failed
                    if (!loadResult) {
                        console.log('🔄 Using backend mode for loading');
                        const loadResponse = await fetch(`${BACKEND_URL}/api/diagrams/import/${selectedDiagram.id}`);
                        loadResult = await loadResponse.json();
                    }

                    ui.spinner.stop();

                    if (loadResult.success) {
                        let content = loadResult.data.content;

                        // Check if diagram is encrypted
                        if (loadResult.data.encrypted) {
                            console.log('🔐 Diagram is encrypted, requesting password...');

                            let decryptionPassword = defaultEncryptionPassword;

                            // If no default password, ask user for password
                            if (!decryptionPassword) {
                                decryptionPassword = await showPrompt('🔐 Decryption Password', 'This diagram is encrypted. Enter password:', '');
                                if (!decryptionPassword) {
                                    await showAlert('❌ Decryption Required', 'Decryption password is required to open this diagram.');
                                    return;
                                }
                            }

                            try {
                                content = decryptContent(content, decryptionPassword);
                                console.log('🔓 Diagram decrypted successfully');
                            } catch (decryptError) {
                                console.error('Decryption failed:', decryptError);
                                await showAlert('❌ Decryption Failed', 'Failed to decrypt diagram. Please check your password.');
                                return;
                            }
                        }

                        const doc = mxUtils.parseXml(content);
                        ui.editor.graph.getModel().beginUpdate();
                        try {
                            ui.editor.setGraphXml(doc.documentElement);
                        } finally {
                            ui.editor.graph.getModel().endUpdate();
                        }
                        await showAlert('✅ Loaded', `Diagram "${selectedDiagram.title}" loaded successfully!`);
                    } else {
                        await showAlert('❌ Load Failed', loadResult.error);
                    }
                } catch (error) {
                    ui.spinner.stop();
                    console.error('Load error:', error);
                    await showAlert('❌ Load Failed', error.message);
                }
            }

            // Delete diagram function
            async function deleteDiagram(diagramId) {
                try {
                    ui.spinner.spin(document.body, 'Deleting diagram...');

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/delete/${diagramId}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Wallet-Address': walletAddress
                        }
                    });

                    const result = await response.json();
                    ui.spinner.stop();

                    if (result.success) {
                        await showAlert('✅ Diagram Deleted', 'Diagram deleted successfully!');
                    } else {
                        await showAlert('❌ Delete Failed', result.error);
                    }

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Delete error:', error);
                    await showAlert('❌ Delete Failed', error.message);
                }
            }

            // Show load dialog
            const showLoadDialog = withOperationLock(async function() {
                try {
                    if (!(await checkWallet())) return;

                    ui.spinner.spin(document.body, 'Loading diagrams...');

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/list`, {
                        headers: {
                            'X-Wallet-Address': walletAddress
                        }
                    }, 15000);

                    if (!response.ok) {
                        throw new Error(`Server error: ${response.status} ${response.statusText}`);
                    }

                    const result = await response.json();
                    ui.spinner.stop();

                    console.log('📋 List response:', result);

                    if (!result.success) {
                        throw new Error(result.error || 'Failed to load diagrams');
                    }

                    if (!result.data || result.data.length === 0) {
                        await showAlert('📂 No Diagrams Found', 'No saved diagrams found.\n\nSave a diagram first using "Save to Arkiv"!');
                        return;
                    }

                    // Create HTML dialog with proper UI
                    const diagrams = result.data;
                    showDiagramDialog(diagrams);

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Load error:', error);

                    let errorMsg = error.message;
                    if (errorMsg.includes('timeout')) {
                        errorMsg += '\n\nCheck your internet connection and try again.';
                    }

                    await showAlert('❌ Load Failed', errorMsg);
                }
            });

            // Load user configuration
            async function loadUserConfig() {
                try {
                    if (!walletAddress) return;

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/config`, {
                        headers: {
                            'X-Wallet-Address': walletAddress
                        }
                    }, 10000);

                    if (!response.ok) {
                        throw new Error(`Failed to load config: ${response.status}`);
                    }

                    const result = await response.json();
                    if (result.success) {
                        userConfig = result.config;
                        console.log('📋 User config loaded:', userConfig);
                    } else {
                        console.log('📋 Using default config');
                    }
                } catch (error) {
                    console.error('❌ Error loading user config:', error);
                    userConfig = null; // Use defaults
                }
            }

            // Save user configuration
            async function saveUserConfig(config) {
                try {
                    if (!walletAddress) return false;

                    // Validate BTL range
                    if (config.btlDays < 1 || config.btlDays > 365) {
                        throw new Error('BTL days must be between 1 and 365');
                    }

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/config`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Wallet-Address': walletAddress
                        },
                        body: JSON.stringify(config)
                    }, 15000);

                    if (!response.ok) {
                        throw new Error(`Server error: ${response.status} ${response.statusText}`);
                    }

                    const result = await response.json();
                    if (result.success) {
                        userConfig = result.config;
                        console.log('💾 User config saved:', userConfig);
                        return true;
                    } else {
                        throw new Error(result.error || 'Failed to save configuration');
                    }
                } catch (error) {
                    console.error('❌ Error saving user config:', error);
                    await showAlert('❌ Configuration Failed', `Configuration save failed: ${error.message}`);
                    return false;
                }
            }

            // Update ETH balance
            async function updateEthBalance() {
                try {
                    if (!walletAddress || typeof window.ethereum === 'undefined') return;

                    const balance = await window.ethereum.request({
                        method: 'eth_getBalance',
                        params: [walletAddress, 'latest']
                    });

                    // Convert from wei to ETH
                    const ethValue = parseInt(balance, 16) / Math.pow(10, 18);
                    ethBalance = ethValue.toFixed(4);
                    console.log('💰 ETH Balance:', ethBalance);
                } catch (error) {
                    console.error('❌ Error getting balance:', error);
                    ethBalance = 'Error';
                }
            }

            // Show configuration dialog
            async function showConfigDialog() {
                if (!walletAddress) {
                    await showAlert('❌ Wallet Required', 'Please connect your wallet first.');
                    return;
                }

                // Create overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

                // Create dialog
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                `;

                const currentConfig = userConfig || { btlDays: 100, autoSave: false, showBalance: true, encryptByDefault: false, encryptionPassword: '' };

                dialog.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        <h3 style="margin: 0;">⚙️ Configuration</h3>
                        <button id="closeConfig" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">✖</button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">💰 Wallet Info:</div>
                        <div style="font-size: 12px; color: #666;">Address: ${walletAddress}</div>
                        <div style="font-size: 12px; color: #666;">Balance: ${ethBalance} ETH</div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">⏰ Document Storage (BTL Days):</label>
                        <input type="number" id="btlDays" value="${currentConfig.btlDays}" min="1" max="365" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">How many days documents should be stored in Arkiv</div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="autoSave" ${currentConfig.autoSave ? 'checked' : ''} style="margin-right: 8px;">
                            <span>💾 Auto-save diagrams</span>
                        </label>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="showBalance" ${currentConfig.showBalance ? 'checked' : ''} style="margin-right: 8px;">
                            <span>💰 Show wallet balance</span>
                        </label>
                    </div>

                    <div style="margin-bottom: 15px; border-top: 1px solid #eee; padding-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">🔐 Encryption Settings</h4>

                        <div style="margin-bottom: 10px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" id="encryptByDefault" ${currentConfig.encryptByDefault ? 'checked' : ''} style="margin-right: 8px;">
                                <span>Encrypt diagrams by default</span>
                            </label>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <label style="display: block; font-weight: bold; margin-bottom: 5px;">Default Encryption Password:</label>
                            <input type="password" id="encryptionPassword" value="${currentConfig.encryptionPassword || ''}" placeholder="Enter default password" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <div style="font-size: 11px; color: #666; margin-top: 2px;">This password will be used automatically for encryption/decryption</div>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px; border-top: 1px solid #eee; padding-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">🚀 Connection Mode</h4>

                        <div style="margin-bottom: 10px;">
                            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                                <input type="radio" name="connectionMode" value="sdk" ${isSDKMode ? 'checked' : ''} style="margin-right: 8px;">
                                <span><strong>Direct SDK</strong> - Post directly via MetaMask on ${ARKIV_CONFIG.name}</span>
                            </label>
                            <div style="font-size: 11px; color: #666; margin-left: 20px; margin-bottom: 8px;">Uses Chain ID ${ARKIV_CONFIG.chainId} (${ARKIV_CONFIG.name})</div>

                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="radio" name="connectionMode" value="backend" ${!isSDKMode ? 'checked' : ''} style="margin-right: 8px;">
                                <span><strong>Backend Relay</strong> - Via server proxy (easier)</span>
                            </label>
                            <div style="font-size: 11px; color: #666; margin-left: 20px;">Server pays gas fees, simpler UX</div>
                        </div>

                        <div id="sdkStatus" style="font-size: 12px; padding: 8px; border-radius: 4px; margin-top: 10px; ${isSDKMode ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 'background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;'}">
                            ${isSDKMode ? `✅ SDK Mode Active - Direct MetaMask posting on ${ARKIV_CONFIG.name}` : '🔄 Backend Mode - Server relay active'}
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancelConfig" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button id="saveConfig" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save</button>
                    </div>
                `;

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // Event handlers
                document.getElementById('closeConfig').onclick = () => document.body.removeChild(overlay);
                document.getElementById('cancelConfig').onclick = () => document.body.removeChild(overlay);

                document.getElementById('saveConfig').onclick = async () => {
                    const btlDays = parseInt(document.getElementById('btlDays').value);
                    const autoSave = document.getElementById('autoSave').checked;
                    const showBalance = document.getElementById('showBalance').checked;
                    const encryptByDefault = document.getElementById('encryptByDefault').checked;
                    const encryptionPassword = document.getElementById('encryptionPassword').value.trim();
                    if (btlDays < 1 || btlDays > 365) {
                        await showAlert('❌ Invalid Value', 'BTL Days must be between 1 and 365');
                        return;
                    }

                    const selectedMode = document.querySelector('input[name="connectionMode"]:checked').value;

                    // Handle mode change with dPaste config
                    if (selectedMode === 'sdk' && !isSDKMode) {
                        console.log('🔄 Switching to SDK mode with dPaste config...');
                        await ensureGolemNetwork();
                        const sdkReady = await initializeGolemSDK();
                        if (!sdkReady) {
                            await showAlert('❌ SDK Failed', 'Failed to initialize SDK mode. Check MetaMask and network connection.');
                            return;
                        }
                    } else if (selectedMode === 'backend') {
                        console.log('🔄 Switching to backend mode...');
                        isSDKMode = false;
                        arkivClient = null;
                    }

                    const newConfig = {
                        btlDays,
                        autoSave,
                        showBalance,
                        encryptByDefault,
                        encryptionPassword: encryptionPassword || undefined
                    };
                    const saved = await saveUserConfig(newConfig);

                    if (saved) {
                        await showAlert('✅ Configuration Saved', 'Configuration saved successfully!');
                        document.body.removeChild(overlay);
                    } else {
                        await showAlert('❌ Save Failed', 'Failed to save configuration. Please try again.');
                    }
                };

                // Close on ESC key
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        document.body.removeChild(overlay);
                        document.removeEventListener('keydown', escHandler);
                    }
                });
            }

            // Open web manager
            function openWebManager() {
                window.open(BACKEND_URL, '_blank');
            }

            // Add actions first
            ui.actions.addAction('golemdb-wallet', async function() {
                if (walletConnected) {
                    const choice = await showConfirm('🔐 Wallet Connected', `Address: ${walletAddress}\n\nDo you want to disconnect?`);
                    if (choice) {
                        await disconnectWallet();
                    }
                } else {
                    connectWallet();
                }
            }, null, null, walletConnected ? '🔐 MetaMask Wallet (Connected)' : '🔒 Connect MetaMask Wallet');

            ui.actions.addAction('golemdb-save', function() {
                saveToGolemDB();
            }, null, null, '💾 Save to Arkiv');

            ui.actions.addAction('golemdb-load', function() {
                showLoadDialog();
            }, null, null, '📂 Open from Arkiv');

            ui.actions.addAction('golemdb-manager', function() {
                openWebManager();
            }, null, null, '🌐 Arkiv Manager');

            // Configuration dialog function
            async function showConfigDialog() {
                const currentMode = isSDKMode ? 'SDK' : 'Backend';
                const modal = document.createElement('div');
                modal.className = 'golem-modal-overlay';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.6);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s ease;
                `;

                const content = document.createElement('div');
                content.style.cssText = `
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: slideIn 0.3s ease;
                `;

                content.innerHTML = `
                    <h2 style="margin-top: 0; color: #333; font-size: 24px; margin-bottom: 20px;">⚙️ Arkiv Configuration</h2>

                    <div style="margin: 20px 0;">
                        <h3 style="color: #555; margin-bottom: 15px;">📡 Posting Mode</h3>
                        <p style="color: #666; margin-bottom: 15px;">Choose how diagrams are saved to Arkiv:</p>

                        <label style="display: block; margin: 10px 0; padding: 15px; border: 2px solid #e1e5e9; border-radius: 8px; cursor: pointer; transition: all 0.3s;">
                            <input type="radio" name="mode" value="sdk" ${isSDKMode ? 'checked' : ''} style="margin-right: 10px;">
                            <strong>🚀 Direct SDK Mode</strong>
                            <div style="margin-top: 5px; color: #666; font-size: 14px;">
                                • Post directly from your MetaMask wallet<br>
                                • Uses Chain ID ${ARKIV_CONFIG.chainId}<br>
                                • Full decentralization<br>
                                • Your keys, your data
                            </div>
                        </label>

                        <label style="display: block; margin: 10px 0; padding: 15px; border: 2px solid #e1e5e9; border-radius: 8px; cursor: pointer; transition: all 0.3s;">
                            <input type="radio" name="mode" value="backend" ${!isSDKMode ? 'checked' : ''} style="margin-right: 10px;">
                            <strong>🔄 Backend Relay Mode</strong>
                            <div style="margin-top: 5px; color: #666; font-size: 14px;">
                                • Backend posts on your behalf<br>
                                • No gas fees for you<br>
                                • Faster and simpler<br>
                                • Backend pays transaction costs
                            </div>
                        </label>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <p style="margin: 0; color: #666; font-size: 14px;">
                            <strong>Current Mode:</strong> ${currentMode}<br>
                            <strong>Wallet:</strong> ${walletAddress || 'Not connected'}
                        </p>
                    </div>

                    <div style="margin-top: 30px; text-align: center;">
                        <button id="save-config" style="background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-right: 10px;">
                            💾 Save Settings
                        </button>
                        <button id="cancel-config" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px;">
                            Cancel
                        </button>
                    </div>
                `;

                modal.appendChild(content);
                document.body.appendChild(modal);

                // Add CSS for animations
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideIn {
                        from { transform: translateY(-50px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    .golem-modal-overlay label:hover {
                        border-color: #667eea !important;
                        background: #f8f9ff !important;
                    }
                `;
                document.head.appendChild(style);

                // Handle radio button selection highlighting
                const radios = content.querySelectorAll('input[type="radio"]');
                radios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        radios.forEach(r => {
                            const label = r.closest('label');
                            if (r.checked) {
                                label.style.borderColor = '#667eea';
                                label.style.background = '#f8f9ff';
                            } else {
                                label.style.borderColor = '#e1e5e9';
                                label.style.background = 'white';
                            }
                        });
                    });
                });

                // Trigger initial highlighting
                radios.forEach(radio => {
                    if (radio.checked) {
                        radio.dispatchEvent(new Event('change'));
                    }
                });

                return new Promise((resolve) => {
                    content.querySelector('#save-config').onclick = async () => {
                        const selectedMode = content.querySelector('input[name="mode"]:checked').value;

                        if (selectedMode === 'sdk') {
                            // Enable SDK mode with dPaste config
                            await ensureGolemNetwork();
                            isSDKMode = true;
                            localStorage.setItem('golem-db-mode', 'sdk');
                            await showAlert('✅ SDK Mode Enabled', 'Direct posting mode enabled with dPaste configuration! Diagrams will be saved directly from your MetaMask wallet to Arkiv.');
                        } else {
                            // Enable backend mode
                            isSDKMode = false;
                            localStorage.setItem('golem-db-mode', 'backend');
                            await showAlert('✅ Backend Mode Enabled', 'Backend relay mode enabled! Diagrams will be saved through the backend service.');
                        }

                        modal.remove();
                        style.remove();
                        resolve();
                    };

                    content.querySelector('#cancel-config').onclick = () => {
                        modal.remove();
                        style.remove();
                        resolve();
                    };

                    modal.onclick = (e) => {
                        if (e.target === modal) {
                            modal.remove();
                            style.remove();
                            resolve();
                        }
                    };
                });
            }

            ui.actions.addAction('golemdb-config', function() {
                showConfigDialog();
            }, null, null, '⚙️ Configuration');

            // Create configureGolemNetwork function
            async function configureGolemNetwork() {
                try {
                    // Check if MetaMask is available
                    if (typeof window.ethereum === 'undefined') {
                        await showAlert('❌ MetaMask Required', 'Please install MetaMask browser extension to use direct posting to Golem Network.\n\nDownload from: https://metamask.io');
                        return;
                    }

                    // Check if already connected
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    if (accounts.length === 0) {
                        // Request connection
                        const connectResult = await showConfirm('🔗 Connect MetaMask', 'To configure Golem Network, we need to connect to your MetaMask wallet.\n\nConnect now?');
                        if (!connectResult) return;

                        await window.ethereum.request({ method: 'eth_requestAccounts' });
                    }

                    // Get current network
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    const currentChainId = parseInt(chainId, 16);

                    const networkInfo = `Current Network: ${currentChainId === ARKIV_CONFIG.chainId ? `✅ ${ARKIV_CONFIG.name}` : `❌ Chain ${currentChainId} (Wrong Network)`}\n\nTarget Network: ${ARKIV_CONFIG.name} (${ARKIV_CONFIG.chainId})`;

                    if (currentChainId !== ARKIV_CONFIG.chainId) {
                        const switchResult = await showConfirm('🚀 Switch to Golem Network', `${networkInfo}\n\nSwitch to ${ARKIV_CONFIG.name} now?`);
                        if (!switchResult) return;

                        try {
                            // Try to switch to the network
                            await window.ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: '0x' + ARKIV_CONFIG.chainId.toString(16) }],
                            });
                        } catch (switchError) {
                            // Network doesn't exist, add it
                            if (switchError.code === 4902) {
                                await window.ethereum.request({
                                    method: 'wallet_addEthereumChain',
                                    params: [{
                                        chainId: '0x' + ARKIV_CONFIG.chainId.toString(16),
                                        chainName: ARKIV_CONFIG.name,
                                        nativeCurrency: {
                                            name: 'GLM',
                                            symbol: 'GLM',
                                            decimals: 18
                                        },
                                        rpcUrls: [ARKIV_CONFIG.rpcUrl],
                                        blockExplorerUrls: [ARKIV_CONFIG.explorerUrl]
                                    }]
                                });
                            } else {
                                throw switchError;
                            }
                        }
                    }

                    // Check SDK initialization
                    const sdkReady = await initializeGolemSDK();

                    if (sdkReady) {
                        await showAlert('✅ Setup Complete', 'Golem Network is configured and ready!\n\n🌟 You can now save diagrams directly to Arkiv\n💰 You will pay gas fees for transactions\n🔐 Your wallet controls your data');
                    } else {
                        await showAlert('⚠️ Setup Issue', 'Network configured but SDK initialization failed.\n\nPlease try again or use backend mode.');
                    }

                } catch (error) {
                    console.error('Network setup error:', error);
                    await showAlert('❌ Setup Failed', `Failed to configure Golem Network:\n\n${error.message}`);
                }
            }

            ui.actions.addAction('golemdb-network', configureGolemNetwork, null, null, '🚀 Setup Golem Network');

            // Modify the file menu to inject items in proper places
            const fileMenu = ui.menus.get('file');
            if (fileMenu && fileMenu.funct) {
                const oldFunct = fileMenu.funct;
                fileMenu.funct = function(menu, parent) {
                    console.log('🔍 Building File menu with Arkiv integration...');

                    // Override menu.addItem to intercept and inject our items
                    const originalAddItem = menu.addItem;
                    let saveGroupFound = false;
                    let openGroupFound = false;

                    menu.addItem = function(label, icon, action, parent, altText, elt, isEnabled) {
                        // Call original addItem first
                        const result = originalAddItem.call(this, label, icon, action, parent, altText, elt, isEnabled);

                        // Inject Save to Arkiv after standard save options
                        if (!saveGroupFound && (
                            label?.includes('Save') ||
                            label?.includes('Export') ||
                            (typeof label === 'string' && (label.includes('save') || label.includes('export')))
                        )) {
                            // Add our save option after the first save-related item
                            originalAddItem.call(this, '💾 Save to Arkiv', null, function() {
                                ui.actions.get('golemdb-save').funct();
                            }, parent);
                            saveGroupFound = true;
                        }

                        // Inject Open from Arkiv after standard open options
                        if (!openGroupFound && (
                            label?.includes('Open') ||
                            label?.includes('Import') ||
                            (typeof label === 'string' && (label.includes('open') || label.includes('import')))
                        )) {
                            // Add our open option after the first open-related item
                            originalAddItem.call(this, '📂 Open from Arkiv', null, function() {
                                ui.actions.get('golemdb-load').funct();
                            }, parent);
                            openGroupFound = true;
                        }

                        return result;
                    };

                    // Build the original menu
                    oldFunct.apply(this, arguments);

                    // Restore original addItem function
                    menu.addItem = originalAddItem;

                    // Add remaining items at the end if they weren't injected
                    menu.addSeparator(parent);

                    // Add wallet connection item
                    menu.addItem('🔐 MetaMask Wallet', null, function() {
                        ui.actions.get('golemdb-wallet').funct();
                    }, parent);

                    menu.addSeparator(parent);

                    // Add save item if not already injected
                    if (!saveGroupFound) {
                        menu.addItem('💾 Save to Arkiv', null, function() {
                            ui.actions.get('golemdb-save').funct();
                        }, parent);
                    }

                    // Add load item if not already injected
                    if (!openGroupFound) {
                        menu.addItem('📂 Open from Arkiv', null, function() {
                            ui.actions.get('golemdb-load').funct();
                        }, parent);
                    }

                    // Add manager and config items
                    menu.addItem('🌐 Arkiv Manager', null, function() {
                        ui.actions.get('golemdb-manager').funct();
                    }, parent);

                    menu.addItem('⚙️ Configuration', null, function() {
                        ui.actions.get('golemdb-config').funct();
                    }, parent);

                    menu.addItem('🚀 Setup Golem Network', null, function() {
                        ui.actions.get('golemdb-network').funct();
                    }, parent);

                    console.log('✅ Arkiv menu items integrated successfully!');
                };
            }

            // Add popup menu (right-click context menu) integration
            const originalGetPopupMenu = ui.menus.get('popupMenu');
            if (originalGetPopupMenu && originalGetPopupMenu.funct) {
                const originalPopupFunct = originalGetPopupMenu.funct;
                originalGetPopupMenu.funct = function(menu, cell, evt) {
                    // Call original popup menu first
                    originalPopupFunct.call(this, menu, cell, evt);

                    // Add separator and our items
                    menu.addSeparator();

                    // Add Arkiv options to popup menu
                    menu.addItem('💾 Save to Arkiv', null, function() {
                        ui.actions.get('golemdb-save').funct();
                    });

                    menu.addItem('📂 Open from Arkiv', null, function() {
                        ui.actions.get('golemdb-load').funct();
                    });

                    menu.addItem('🌐 Arkiv Manager', null, function() {
                        ui.actions.get('golemdb-manager').funct();
                    });

                    menu.addItem('⚙️ Configuration', null, function() {
                        ui.actions.get('golemdb-config').funct();
                    });

                    menu.addItem('🚀 Setup Golem Network', null, function() {
                        ui.actions.get('golemdb-network').funct();
                    });

                    console.log('✅ Arkiv popup menu items added!');
                };
            }

            // Update wallet status displays
            function updateWalletStatusDisplays() {
                console.log(`💳 Wallet status: ${walletConnected ? `Connected (${walletAddress})` : 'Disconnected'}`);

                // Update status widget if it exists
                try {
                    const widget = document.getElementById('metamask-status-widget');
                    if (widget) {
                        // Trigger widget refresh
                        const refreshBtn = document.getElementById('refresh-status-btn');
                        if (refreshBtn) {
                            refreshBtn.click();
                        }
                    }
                } catch (error) {
                    // Ignore widget update errors
                }
            }

            // Auto-connect wallet if already authorized
            async function autoConnectWallet() {
                try {
                    if (typeof window.ethereum !== 'undefined') {
                        // Check if we have permission to access accounts
                        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                        if (accounts.length > 0) {
                            console.log('🔄 Auto-connecting to previously authorized wallet...');
                            walletAddress = accounts[0];
                            walletConnected = true;
                            console.log('✅ Auto-connected to wallet:', walletAddress);

                            // Setup wallet change detection
                            setupWalletChangeDetection();

                            // Update wallet status displays
                            updateWalletStatusDisplays();

                            return true;
                        }
                    }
                } catch (error) {
                    console.log('ℹ️ No previous wallet authorization found');
                }
                return false;
            }

            // MetaMask Status Widget
            function createMetaMaskStatusWidget() {
                try {
                    // Create widget container
                    const statusWidget = document.createElement('div');
                    statusWidget.id = 'metamask-status-widget';
                    statusWidget.style.cssText = `
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        background: rgba(255, 255, 255, 0.95);
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        padding: 10px 15px;
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        z-index: 10000;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        min-width: 200px;
                        backdrop-filter: blur(5px);
                    `;

                    // Create content
                    statusWidget.innerHTML = `
                        <div style="font-weight: bold; color: #333; margin-bottom: 5px;">🦊 MetaMask Status</div>
                        <div id="metamask-connection-status">Checking...</div>
                        <div id="metamask-network-status">Network: Unknown</div>
                        <div id="metamask-balance-status">Balance: Loading...</div>
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                            <button id="refresh-status-btn" style="
                                background: #667eea;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 11px;
                            ">🔄 Refresh</button>
                        </div>
                    `;

                    // Add to page
                    document.body.appendChild(statusWidget);

                    // Update status function
                    async function updateStatusWidget() {
                        const connectionEl = document.getElementById('metamask-connection-status');
                        const networkEl = document.getElementById('metamask-network-status');
                        const balanceEl = document.getElementById('metamask-balance-status');

                        try {
                            if (typeof window.ethereum === 'undefined') {
                                connectionEl.innerHTML = '❌ Not installed';
                                networkEl.innerHTML = 'Network: N/A';
                                balanceEl.innerHTML = 'Balance: N/A';
                                return;
                            }

                            // Connection status
                            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                            if (accounts.length > 0) {
                                const address = accounts[0];
                                connectionEl.innerHTML = `✅ Connected<br><span style="font-family: monospace; font-size: 10px;">${address.substring(0, 6)}...${address.substring(38)}</span>`;

                                // Network status
                                try {
                                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                                    const chainIdDecimal = parseInt(chainId, 16);
                                    const isGolemNetwork = chainIdDecimal === ARKIV_CONFIG.chainId;
                                    networkEl.innerHTML = `Network: ${isGolemNetwork ? '✅' : '❌'} ${isGolemNetwork ? ARKIV_CONFIG.name : `Chain ${chainIdDecimal}`}`;

                                    // Balance status
                                    try {
                                        const balance = await window.ethereum.request({
                                            method: 'eth_getBalance',
                                            params: [address, 'latest']
                                        });
                                        const balanceEth = parseInt(balance, 16) / 1e18;
                                        balanceEl.innerHTML = `Balance: ${balanceEth.toFixed(6)} ${isGolemNetwork ? 'TGOLEM' : 'ETH'}`;
                                    } catch (balanceError) {
                                        balanceEl.innerHTML = 'Balance: Error loading';
                                    }
                                } catch (networkError) {
                                    networkEl.innerHTML = 'Network: Error loading';
                                    balanceEl.innerHTML = 'Balance: N/A';
                                }
                            } else {
                                connectionEl.innerHTML = '🔒 Not connected';
                                networkEl.innerHTML = 'Network: N/A';
                                balanceEl.innerHTML = 'Balance: N/A';
                            }
                        } catch (error) {
                            connectionEl.innerHTML = '❌ Error';
                            networkEl.innerHTML = 'Network: Error';
                            balanceEl.innerHTML = 'Balance: Error';
                        }
                    }

                    // Refresh button
                    document.getElementById('refresh-status-btn').addEventListener('click', updateStatusWidget);

                    // Initial update
                    updateStatusWidget();

                    // Auto-refresh every 10 seconds
                    setInterval(updateStatusWidget, 10000);

                    console.log('✅ MetaMask status widget created');
                } catch (error) {
                    console.error('❌ Failed to create status widget:', error);
                }
            }

            console.log('🎉 Built-in Arkiv Plugin loaded successfully!');

            // Create MetaMask status widget
            createMetaMaskStatusWidget();

            // Display plugin version and features
            console.log('');
            console.log('🚀 ========================================');
            console.log('🌟    GOLEM DB PLUGIN FOR DRAW.IO       ');
            console.log('🚀 ========================================');
            console.log(`📦 Version: ${PLUGIN_VERSION}`);
            console.log(`🔗 Backend: ${BACKEND_URL}`);
            console.log(`💳 Auto-connect: ${typeof window.ethereum !== 'undefined' ? 'Enabled' : 'Disabled (no MetaMask)'}`);
            console.log(`🎯 Mode: ${isSDKMode ? `SDK (Direct posting on ${ARKIV_CONFIG.name})` : 'Backend (Relay)'}`);
            console.log('');
            console.log('✨ Features:');
            console.log(`   • 🚀 Direct posting via MetaMask (SDK mode with Chain ${ARKIV_CONFIG.chainId})`);
            console.log('   • 🔄 Backend relay posting');
            console.log('   • 🔐 Automatic wallet reconnection');
            console.log('   • 🎨 Beautiful modal dialogs');
            console.log('   • 📊 Wallet status display');
            console.log('   • 📱 Right-click menu integration');
            console.log('');
            console.log('📍 Right-click on diagram to access Arkiv options');
            console.log('🚀 ========================================');

            // Auto-connect wallet after plugin loads
            setTimeout(async () => {
                await autoConnectWallet();
            }, 1000);

            // Status box completely disabled - no visual elements

            // Show elegant welcome modal
            setTimeout(() => {
                showWelcomeModal();
            }, 2000);

            // Welcome modal function
            function showWelcomeModal() {
                // Create overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                `;

                // Create modal
                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 16px;
                    padding: 0;
                    max-width: 480px;
                    width: 90%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    color: white;
                    text-align: center;
                    animation: slideIn 0.4s ease-out;
                    overflow: hidden;
                `;

                modal.innerHTML = `
                    <div style="padding: 40px 30px 30px 30px;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
                        <h2 style="margin: 0 0 15px 0; font-size: 28px; font-weight: 600;">Arkiv Plugin Ready!</h2>
                        <p style="margin: 0 0 25px 0; font-size: 16px; opacity: 0.9; line-height: 1.5;">
                            Your Draw.io now has powerful Arkiv integration with MetaMask authentication.
                        </p>

                        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: left;">
                            <div style="font-weight: 600; margin-bottom: 12px; text-align: center;">✨ New Features Available</div>
                            <div style="font-size: 14px; line-height: 1.6;">
                                • 🔐 <strong>MetaMask Wallet</strong> - Secure authentication<br>
                                • 💾 <strong>Save to Arkiv</strong> - Decentralized storage<br>
                                • 📂 <strong>Load from Arkiv</strong> - Access your diagrams<br>
                                • ⚙️ <strong>Configuration</strong> - Customize BTL & settings<br>
                                • 🌐 <strong>Arkiv Manager</strong> - Web interface
                            </div>
                        </div>

                        <div style="font-size: 13px; opacity: 0.8; margin-bottom: 25px;">
                            Find all options in the <strong>File menu</strong>
                        </div>
                    </div>

                    <div style="background: rgba(0,0,0,0.1); padding: 20px;">
                        <button id="welcomeOk" style="
                            background: white;
                            color: #667eea;
                            border: none;
                            border-radius: 8px;
                            padding: 12px 32px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                        ">Got it!</button>
                    </div>
                `;

                // Add animations
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideIn {
                        from { transform: scale(0.8) translateY(-20px); opacity: 0; }
                        to { transform: scale(1) translateY(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);

                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                // Button hover effects
                const button = modal.querySelector('#welcomeOk');
                button.onmouseenter = () => {
                    button.style.transform = 'translateY(-2px)';
                    button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
                };
                button.onmouseleave = () => {
                    button.style.transform = 'translateY(0)';
                    button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
                };

                // Close modal
                button.onclick = () => {
                    overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
                    setTimeout(() => {
                        document.body.removeChild(overlay);
                        document.head.removeChild(style);
                    }, 200);
                };

                // Close on ESC key
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        button.click();
                        document.removeEventListener('keydown', escHandler);
                    }
                });

                // Auto-close after 30 seconds
                setTimeout(() => {
                    if (document.body.contains(overlay)) {
                        button.click();
                    }
                }, 30000);
            }

            // Share diagram function
            function shareDiagram(diagram) {
                const shareUrl = `https://drawiodb.online/?diagram=${diagram.id}`;
                const explorerUrl = diagram.entityKey && !diagram.entityKey.startsWith('sharded:')
                    ? `${ARKIV_CONFIG.explorerUrl}/entity/${diagram.entityKey}?tab=data`
                    : '';
                const shareText = `📊 Check out my diagram: "${diagram.title}"\n\n🔗 Open in Draw.io:\n${shareUrl}${explorerUrl ? `\n\n🔍 View on ${ARKIV_CONFIG.name} Explorer:\n${explorerUrl}` : ''}\n\n🌐 Powered by Golem Network`;

                // Create custom modal overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10003;
                `;

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                `;

                modal.innerHTML = `
                    <h2 style="margin-top: 0; color: #333;">📤 Share Diagram</h2>

                    <div style="text-align: left; margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        <p style="margin: 5px 0;"><strong>Title:</strong> ${diagram.title}</p>
                        <p style="margin: 5px 0;"><strong>Author:</strong> ${diagram.author}</p>
                        <p style="margin: 5px 0;"><strong>Created:</strong> ${new Date(diagram.timestamp).toLocaleDateString()}</p>
                    </div>

                    <div style="margin: 20px 0;">
                        <h4 style="color: #333;">🔗 Share Links:</h4>

                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
                            <label style="font-weight: bold; color: #333;">Draw.io Link:</label><br>
                            <input type="text" value="${shareUrl}" readonly style="width: calc(100% - 80px); padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;" onclick="this.select()">
                            <button onclick="copyText('${shareUrl}', 'Link copied!')" style="background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; margin-left: 5px;">📋</button>
                        </div>

                        ${explorerUrl ? `
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
                            <label style="font-weight: bold; color: #333;">Explorer Link:</label><br>
                            <input type="text" value="${explorerUrl}" readonly style="width: calc(100% - 80px); padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;" onclick="this.select()">
                            <button onclick="copyText('${explorerUrl}', 'Explorer link copied!')" style="background: #17a2b8; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; margin-left: 5px;">📋</button>
                        </div>
                        ` : ''}

                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
                            <label style="font-weight: bold; color: #333;">Share Message:</label><br>
                            <textarea readonly style="width: 100%; height: 120px; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: monospace; font-size: 12px;" onclick="this.select()">${shareText}</textarea>
                            <button onclick="copyText(\`${shareText.replace(/`/g, '\\`').replace(/'/g, "\\'")}\`, 'Message copied!')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">📋 Copy Message</button>
                        </div>
                    </div>

                    <button onclick="document.body.removeChild(document.querySelector('.share-modal-overlay'))" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-top: 20px; font-size: 14px;">Close</button>
                `;

                overlay.appendChild(modal);
                overlay.className = 'share-modal-overlay';
                overlay.style.zIndex = '10001'; // Higher than load modal
                document.body.appendChild(overlay);

                // Close on background click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                    }
                });

                // Global copy function for this modal
                window.copyText = function(text, message) {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(text).then(() => {
                            showToast(message || 'Copied!');
                        }).catch(() => {
                            fallbackCopy(text, message);
                        });
                    } else {
                        fallbackCopy(text, message);
                    }
                };

                function fallbackCopy(text, message) {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed";
                    textArea.style.top = "0";
                    textArea.style.left = "0";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        showToast(message || 'Copied!');
                    } catch (err) {
                        showToast('Copy failed - please copy manually');
                    }
                    document.body.removeChild(textArea);
                }

                function showToast(message) {
                    const toast = document.createElement('div');
                    toast.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #333;
                        color: white;
                        padding: 12px 20px;
                        border-radius: 8px;
                        z-index: 10002;
                        opacity: 0;
                        transition: opacity 0.3s;
                    `;
                    toast.textContent = message;
                    document.body.appendChild(toast);

                    setTimeout(() => toast.style.opacity = '1', 10);
                    setTimeout(() => {
                        toast.style.opacity = '0';
                        setTimeout(() => {
                            if (document.body.contains(toast)) {
                                document.body.removeChild(toast);
                            }
                        }, 300);
                    }, 2000);
                }
            }

            // Copy to clipboard helper (legacy function, now handled by copyText)
            function copyToClipboard(text) {
                if (window.copyText) {
                    window.copyText(text, 'Copied!');
                } else {
                    // Fallback if copyText not available
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(text).then(() => {
                            console.log('Copied to clipboard');
                        }).catch(err => {
                            console.error('Failed to copy: ', err);
                        });
                    }
                }
            }

            // Auto-load diagram if URL parameter exists
            if (diagramId) {
                console.log(`🚀 Auto-loading diagram: ${diagramId}`);

                // Wait a bit for UI to be fully ready
                setTimeout(() => {
                    loadDiagramById(diagramId);
                }, 1000);
            }

            // Function to load diagram by ID without showing the list
            async function loadDiagramById(id) {
                try {
                    console.log(`📥 Loading diagram directly: ${id}`);

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/import/${id}`);
                    const result = await response.json();

                    if (result.success && result.data) {
                        console.log(`✅ Diagram loaded: ${result.data.title}`);

                        // Load the diagram into Draw.io
                        let xmlContent = result.data.content;

                        // Check if diagram is encrypted
                        if (result.data.encrypted) {
                            console.log('🔐 Auto-load diagram is encrypted...');

                            let decryptionPassword = defaultEncryptionPassword;

                            // If no default password, ask user for password
                            if (!decryptionPassword) {
                                decryptionPassword = await showPrompt('🔐 Decryption Password', `Diagram "${result.data.title}" is encrypted.\nEnter password:`, '');
                                if (!decryptionPassword) {
                                    await showAlert('❌ Decryption Required', 'Decryption password is required to open this diagram.');
                                    return;
                                }
                            }

                            try {
                                xmlContent = decryptContent(xmlContent, decryptionPassword);
                                console.log('🔓 Auto-load diagram decrypted successfully');
                            } catch (decryptError) {
                                console.error('Auto-load decryption failed:', decryptError);
                                await showAlert('❌ Decryption Failed', 'Failed to decrypt diagram. Please check your password.');
                                return;
                            }
                        }

                        // Use Draw.io's API to load the content
                        if (ui.editor && ui.editor.graph) {
                            try {
                                const doc = mxUtils.parseXml(xmlContent);
                                const root = doc.documentElement;
                                const dec = new mxCodec(root.ownerDocument);
                                const model = dec.decode(root);

                                ui.editor.graph.model.beginUpdate();
                                try {
                                    ui.editor.graph.model.clear();
                                    ui.editor.graph.model.setRoot(model.getRoot());
                                } finally {
                                    ui.editor.graph.model.endUpdate();
                                }

                                ui.editor.setModified(false);
                                ui.editor.undoManager.clear();

                                showModal('✅ Success', `Diagram "${result.data.title}" loaded successfully!`, 3000);
                            } catch (loadError) {
                                console.error('Error loading diagram into Draw.io:', loadError);
                                showModal('❌ Error', 'Failed to load diagram content into Draw.io', 5000);
                            }
                        } else {
                            console.error('Draw.io editor not ready');
                            showModal('❌ Error', 'Draw.io editor not ready', 5000);
                        }
                    } else {
                        console.error('Failed to load diagram:', result.error);
                        showModal('❌ Error', `Failed to load diagram: ${result.error || 'Unknown error'}`, 5000);
                    }
                } catch (error) {
                    console.error('Error loading diagram:', error);
                    showModal('❌ Error', `Error loading diagram: ${error.message}`, 5000);
                }
            }

            // Simple modal function for auto-load feedback
            function showModal(title, message, timeout = 5000) {
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10004;
                    padding: 20px;
                    box-sizing: border-box;
                `;

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: white;
                    border-radius: 15px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    overflow: hidden;
                `;

                const header = document.createElement('div');
                header.style.cssText = `
                    padding: 20px 30px 10px 30px;
                    text-align: center;
                    border-bottom: 1px solid #eee;
                    flex-shrink: 0;
                `;
                header.innerHTML = `<h3 style="margin: 0; color: #333;">${title}</h3>`;

                const content = document.createElement('div');
                content.style.cssText = `
                    padding: 20px 30px;
                    overflow-y: auto;
                    flex-grow: 1;
                    max-height: 50vh;
                    word-wrap: break-word;
                    white-space: pre-wrap;
                `;
                content.innerHTML = `<div style="color: #666; text-align: left;">${message}</div>`;

                const footer = document.createElement('div');
                footer.style.cssText = `
                    padding: 10px 30px 20px 30px;
                    text-align: center;
                    border-top: 1px solid #eee;
                    flex-shrink: 0;
                `;
                footer.innerHTML = `<button onclick="document.body.removeChild(this.closest('.auto-load-modal'))" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">OK</button>`;

                modal.appendChild(header);
                modal.appendChild(content);
                modal.appendChild(footer);

                overlay.appendChild(modal);
                overlay.className = 'auto-load-modal';
                document.body.appendChild(overlay);

                // Auto-close after timeout
                setTimeout(() => {
                    if (document.body.contains(overlay)) {
                        document.body.removeChild(overlay);
                    }
                }, timeout);

                // Close on background click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                    }
                });
            }
        });
    });

})();
