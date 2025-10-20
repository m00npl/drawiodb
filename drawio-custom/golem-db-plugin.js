/**
 * Golem DB Plugin for Draw.io (Built-in Version)
 * Pre-configured for drawiodb.online backend
 * With MetaMask Authentication and Encryption Support
 */
(function() {
    'use strict';

    // Cache busting - force reload when plugin changes
    const PLUGIN_VERSION = Date.now();
    console.log(`🔄 Golem DB Plugin v${PLUGIN_VERSION} loading...`);

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
        golemSDK: {
            url: `https://unpkg.com/golem-base-sdk@0.1.15/dist/golem-base-sdk.min.js?v=${PLUGIN_VERSION}`,
            test: () => typeof window.golem_base_sdk !== 'undefined'
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
            await loadExternalLibrary('golemSDK');
            console.log('🎉 All libraries loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load libraries:', error);
            return false;
        }
    }

    // Golem Network Configuration (matched to actual RPC chain ID)
    const GOLEM_CONFIG = {
        chainId: 60138453025, // Kaolin RPC actual chain ID (0xe0087f821)
        chainIdHex: '0xe0087f821',
        rpcUrl: 'https://kaolin.hoodi.arkiv.network/rpc',
        wsUrl: 'wss://https://kaolin.hoodi.arkiv.network/rpc/rpc/ws',
        explorerUrl: 'https://explorer.https://kaolin.hoodi.arkiv.network/rpc',
        name: 'Golem Kaolin Testnet'
    };

    // Backend URL for drawiodb.online
    const BACKEND_URL = 'https://drawiodb.online';

    // SDK state
    let golemClient = null;
    let isSDKMode = true; // Try SDK mode first with MetaMask

    // User state
    let userTier = 'free'; // free, custodial, wallet
    let walletAddress = null;
    let custodialId = null;
    let userLimits = null;

    console.log('🔥🔥🔥 GOLEM DB PLUGIN SCRIPT LOADED!');

    console.log('🔥 Initializing Built-in Golem DB Plugin with Multi-tier Auth...');
    console.log('🌐 Backend URL:', BACKEND_URL);

    // MetaMask error detection
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
        console.log('✅ Draw.io ready, loading Golem DB plugin...');

        // Check for diagram parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const diagramId = urlParams.get('diagram');

        if (diagramId) {
            console.log(`🔗 Found diagram parameter: ${diagramId}, will auto-load after plugin initialization`);
        }

        // Load the plugin
        Draw.loadPlugin(function(ui) {
            console.log('🎯 Golem DB Plugin UI context loaded');

            // ===== UTILITY FUNCTIONS =====
            function safeRemoveChild(parent, child) {
                try {
                    if (parent && child && parent.contains(child)) {
                        parent.removeChild(child);
                        return true;
                    }
                } catch (error) {
                    console.warn('Safe remove failed:', error);
                }
                return false;
            }

            function safeRemoveElement(element) {
                try {
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                        return true;
                    }
                } catch (error) {
                    console.warn('Safe remove element failed:', error);
                }
                return false;
            }

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
                        <div style="margin: 20px 0; color: #666; line-height: 1.6; white-space: pre-wrap; font-size: 14px;">${message}</div>
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

                    if (typeof window.golem_base_sdk === 'undefined') {
                        throw new Error('Golem SDK not loaded');
                    }

                    console.log('🔄 Initializing Golem SDK...');

                    // Check if Golem network is configured in MetaMask
                    await ensureGolemNetwork();

                    const provider = window.ethereum;
                    const sdk = window.golem_base_sdk;

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
                    golemClient = await sdk.createClient(
                        GOLEM_CONFIG.chainId,
                        accountData,
                        GOLEM_CONFIG.rpcUrl,
                        GOLEM_CONFIG.wsUrl
                    );

                    console.log('✅ Golem SDK initialized with MetaMask signer');

                    // Test network connectivity
                    try {
                        const blockNumber = await golemClient.getRawClient().httpClient.getBlockNumber();
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
                    const currentChainId = await safeMetaMaskRequest({ method: 'eth_chainId' });
                    const expectedChainId = GOLEM_CONFIG.chainIdHex;

                    if (currentChainId !== expectedChainId) {
                        console.log(`🔄 Switching to Golem network (${GOLEM_CONFIG.name})...`);

                        try {
                            // Try to switch to the network
                            await safeMetaMaskRequest({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: expectedChainId }],
                            });
                        } catch (switchError) {
                            // Network doesn't exist, add it
                            if (switchError.code === 4902) {
                                await safeMetaMaskRequest({
                                    method: 'wallet_addEthereumChain',
                                    params: [{
                                        chainId: GOLEM_CONFIG.chainIdHex,
                                        chainName: GOLEM_CONFIG.name,
                                        rpcUrls: [GOLEM_CONFIG.rpcUrl],
                                        blockExplorerUrls: [GOLEM_CONFIG.explorerUrl],
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
                // Check if backend supports write operations
                try {
                    const testExport = {
                        title: "test",
                        author: walletAddress,
                        content: "<test/>"
                    };

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/export`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-wallet-address': walletAddress
                        },
                        body: JSON.stringify(testExport)
                    });

                    const result = await response.json();

                    if (result.requiresFrontendTransaction) {
                        console.log('🔄 Backend requires frontend transactions - using SDK mode');
                        return true;
                    } else {
                        console.log('🔄 Backend supports direct writes - using backend mode');
                        return false;
                    }
                } catch (error) {
                    console.error('❌ Failed to check backend mode, defaulting to SDK:', error);
                    return true;
                }
            }

            // Initialize our custom Golem DB SDK
            let golemDB = null;
            let backendHasPrivateKey = false; // Track if backend can handle transactions

            // Frontend-only mode - no backend API needed
            async function checkBackendPrivateKey() {
                // Frontend-only mode: always use MetaMask for transactions
                backendHasPrivateKey = false;
                console.log('🔑 Frontend-only mode: Using MetaMask for all transactions');
                return false;
            }

            // Determine if user should see sensitive account info
            function shouldShowAccountInfo() {
                // Show if user owns the wallet (has MetaMask) OR backend has private key
                return walletConnected || backendHasPrivateKey;
            }

            async function initGolemDB() {
                if (!golemDB) {
                    // Ensure ethers is loaded first
                    await loadExternalLibrary('ethers');

                    golemDB = new window.GolemDB({
                        rpcUrl: 'https://kaolin.hoodi.arkiv.network/rpc',
                        chainId: 0xE0087F821
                    });
                    await golemDB.connect();
                    console.log('🔗 Custom Golem DB SDK initialized');
                }
                return golemDB;
            }

            // Save diagram using our custom SDK
            async function saveToGolemDBViaSdk(xmlString, diagramId, title, author, encrypted = false) {
                try {
                    console.log(`📦 Saving diagram via Golem Base SDK (${Math.round(xmlString.length/1024)}KB)`);

                    // Use the real Golem Base SDK client
                    if (!golemClient) {
                        throw new Error('Golem client not initialized - please connect wallet first');
                    }

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
                    const btlBlocks = golemClient.calculateBTL(btlDays);

                    const result = await golemClient.createEntity(
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

            async function loadFromGolemDB(diagramId) {
                try {
                    const authRequired = await ensureAuthentication();
                    if (!authRequired) {
                        throw new Error('Authentication required to load diagrams');
                    }

                    if (!golemDB) {
                        await initGolemDB();
                    }

                    console.log(`📥 Loading diagram ${diagramId} from Golem DB via Custom SDK...`);

                    // Load the diagram using custom SDK
                    const result = await golemDB.loadDiagram(diagramId);

                    if (!result) {
                        throw new Error('Diagram not found');
                    }

                    console.log(`✅ Diagram loaded successfully: ${result.title}`);
                    return {
                        success: true,
                        data: result
                    };

                } catch (error) {
                    console.error('❌ Load failed:', error);
                    throw error;
                }
            }

            async function loadFromGolemSDK(diagramId) {
                try {
                    if (!golemClient) {
                        throw new Error('Golem SDK not initialized');
                    }

                    console.log(`📥 Loading diagram ${diagramId} from Golem DB via SDK...`);

                    // Use entity key directly (diagramId is the entity key)
                    try {
                        const storageValue = await golemClient.getStorageValue(diagramId);

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
                    if (!golemClient) {
                        throw new Error('Golem SDK not initialized');
                    }

                    console.log('📋 Listing diagrams from Golem DB via SDK...');

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
            let golemClient = null;
            let ethersProviderInstance = null;
            let ethersSignerInstance = null;
            let isSDKMode = true; // Try SDK mode with MetaMask

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
                    await showAlert('❌ MetaMask Required', 'MetaMask is not installed. Please install MetaMask extension to use Golem DB features.\n\nVisit: https://metamask.io');
                    return false;
                }

                // Load required libraries first
                const librariesLoaded = await loadAllLibraries();
                if (!librariesLoaded) {
                    await showAlert('❌ Libraries Failed', 'Failed to load required libraries for Golem DB integration.');
                    return false;
                }

                try {
                    console.log('🔄 Requesting MetaMask connection...');
                    const accounts = await safeMetaMaskRequest({ method: 'eth_requestAccounts' });

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
                        await showAlert('⚠️ Backend Offline', `Backend server (${BACKEND_URL}) appears to be offline.\n\nWallet connected but Golem DB features may not work.`);
                    }

                    // Załaduj konfigurację użytkownika i balance
                    await loadUserConfig();
                    await updateEthBalance();

                    // Initialize SDK if in SDK mode
                    if (isSDKMode) {
                        try {
                            await initializeGolemSDK();
                            console.log('✅ Golem SDK initialized after wallet connection');
                        } catch (sdkError) {
                            console.warn('⚠️ Failed to initialize SDK after wallet connection:', sdkError);
                        }
                    }

                    const addressInfo = shouldShowAccountInfo() ? `Address: ${walletAddress}\n\n` : '';
                    await showAlert('✅ Wallet Connected', `${addressInfo}You can now save and load diagrams from Golem DB.`);
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
                await showAlert('🔓 Wallet Disconnected', 'You can no longer save/load from Golem DB until reconnected.');
            }

            // User configuration state
            let userConfig = null;
            let ethBalance = 0;
            let isOperationInProgress = false;
            let lastWalletAddress = null;
            let encryptionEnabled = false;
            let defaultEncryptionPassword = null;

            // Helper function for MetaMask requests with circuit breaker handling
            async function safeMetaMaskRequest(request) {
                try {
                    return await window.ethereum.request(request);
                } catch (error) {
                    // Handle specific MetaMask errors gracefully
                    if (error.code === -32603 && error.message.includes('circuit breaker')) {
                        console.warn('⚠️ MetaMask circuit breaker is open. Network may be experiencing issues.');
                        throw new Error('MetaMask network temporarily unavailable. Please try again later.');
                    } else if (error.code === -32002) {
                        console.warn('⚠️ MetaMask request already pending');
                        throw new Error('MetaMask request already pending. Please check MetaMask.');
                    } else if (error.code === 4001) {
                        throw new Error('Request rejected by user.');
                    } else {
                        throw error;
                    }
                }
            }

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

            // Golem DB constants
            const GOLEM_DB_MAX_SIZE = 128 * 1024; // 128KB Golem DB entity limit
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

            // Split document into chunks for Golem DB storage
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
                                golemClient = null;
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
            async function showAuthChoice() {
                return new Promise((resolve) => {
                    const modal = document.createElement('div');
                    modal.className = 'auth-choice-modal';
                    modal.style.cssText = `
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
                        align-items: center; justify-content: center;
                    `;

                    const content = document.createElement('div');
                    content.style.cssText = `
                        background: white; padding: 30px; border-radius: 10px;
                        max-width: 400px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    `;

                    content.innerHTML = `
                        <h2 style="margin-top: 0; color: #333;">🔗 Choose Authentication</h2>
                        <p style="color: #666; margin-bottom: 25px;">How would you like to save/load diagrams?</p>

                        <div style="margin-bottom: 15px;">
                            <button class="auth-wallet-btn" style="
                                width: 100%; padding: 15px; margin-bottom: 10px;
                                background: #f39c12; color: white; border: none;
                                border-radius: 8px; font-size: 16px; cursor: pointer;
                                transition: background 0.3s;
                            ">
                                💳 Connect MetaMask Wallet
                                <div style="font-size: 12px; opacity: 0.9; margin-top: 5px;">
                                    Unlimited diagrams, custom BTL, encryption
                                </div>
                            </button>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <button class="auth-guest-btn" style="
                                width: 100%; padding: 15px; margin-bottom: 10px;
                                background: #3498db; color: white; border: none;
                                border-radius: 8px; font-size: 16px; cursor: pointer;
                                transition: background 0.3s;
                            ">
                                👤 Continue as Guest
                                <div style="font-size: 12px; opacity: 0.9; margin-top: 5px;">
                                    20 diagrams, 30 days storage, sharing enabled
                                </div>
                            </button>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <button class="auth-free-btn" style="
                                width: 100%; padding: 15px; margin-bottom: 10px;
                                background: #95a5a6; color: white; border: none;
                                border-radius: 8px; font-size: 16px; cursor: pointer;
                                transition: background 0.3s;
                            ">
                                🆓 Use Free Tier
                                <div style="font-size: 12px; opacity: 0.9; margin-top: 5px;">
                                    5 diagrams, 7 days storage, basic features
                                </div>
                            </button>
                        </div>

                        <button class="auth-cancel-btn" style="
                            padding: 10px 20px; background: #e74c3c; color: white;
                            border: none; border-radius: 5px; cursor: pointer;
                        ">Cancel</button>
                    `;

                    modal.appendChild(content);
                    document.body.appendChild(modal);

                    // Hover effects
                    content.querySelector('.auth-wallet-btn').addEventListener('mouseenter', function() {
                        this.style.background = '#e67e22';
                    });
                    content.querySelector('.auth-wallet-btn').addEventListener('mouseleave', function() {
                        this.style.background = '#f39c12';
                    });

                    content.querySelector('.auth-guest-btn').addEventListener('mouseenter', function() {
                        this.style.background = '#2980b9';
                    });
                    content.querySelector('.auth-guest-btn').addEventListener('mouseleave', function() {
                        this.style.background = '#3498db';
                    });

                    content.querySelector('.auth-free-btn').addEventListener('mouseenter', function() {
                        this.style.background = '#7f8c8d';
                    });
                    content.querySelector('.auth-free-btn').addEventListener('mouseleave', function() {
                        this.style.background = '#95a5a6';
                    });

                    // Event listeners
                    content.querySelector('.auth-wallet-btn').addEventListener('click', () => {
                        document.body.removeChild(modal);
                        resolve('wallet');
                    });

                    content.querySelector('.auth-guest-btn').addEventListener('click', () => {
                        document.body.removeChild(modal);
                        resolve('custodial');
                    });

                    content.querySelector('.auth-free-btn').addEventListener('click', () => {
                        document.body.removeChild(modal);
                        resolve('free');
                    });

                    content.querySelector('.auth-cancel-btn').addEventListener('click', () => {
                        document.body.removeChild(modal);
                        resolve(null);
                    });

                    // ESC key support
                    const escHandler = (e) => {
                        if (e.key === 'Escape') {
                            document.removeEventListener('keydown', escHandler);
                            if (document.body.contains(modal)) {
                                document.body.removeChild(modal);
                            }
                            resolve(null);
                        }
                    };
                    document.addEventListener('keydown', escHandler);
                });
            }

            async function ensureAuthentication() {
                // If already authenticated, return true
                if (walletConnected || custodialId) {
                    return true;
                }

                // Check if user has a saved preference
                const savedChoice = localStorage.getItem('golemdb-auth-choice');
                let choice = null;

                if (savedChoice) {
                    console.log('🔄 Using saved authentication choice:', savedChoice);
                    choice = savedChoice;
                } else {
                    choice = await showAuthChoice();
                    if (!choice) return false;

                    // Save user choice for future saves
                    localStorage.setItem('golemdb-auth-choice', choice);
                    console.log('💾 Saved authentication choice:', choice);
                }

                switch (choice) {
                    case 'wallet':
                        const connected = await connectWallet();
                        if (connected) {
                            userTier = 'wallet';
                            // walletAddress already set by connectWallet()
                            await updateUserInfo();
                            return true;
                        }
                        return false;

                    case 'custodial':
                        try {
                            const response = await fetch(`${BACKEND_URL}/api/auth/custodial`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                            });
                            const data = await response.json();

                            if (data.success) {
                                custodialId = data.custodialId;
                                userTier = 'custodial';
                                userLimits = data.userTier.limits;
                                console.log('✅ Custodial session created:', custodialId);
                                await showAlert('👤 Guest Mode Active', `Guest session created!\n\nLimits: ${data.userTier.limits.maxDiagrams} diagrams, ${data.userTier.limits.defaultBTLDays} days storage`);
                                return true;
                            } else {
                                await showAlert('❌ Guest Mode Failed', 'Failed to create guest session. Try again.');
                                return false;
                            }
                        } catch (error) {
                            console.error('Custodial auth error:', error);
                            await showAlert('❌ Connection Error', 'Failed to connect to server. Try again.');
                            return false;
                        }

                    case 'free':
                        userTier = 'free';
                        userLimits = {
                            maxDiagrams: 5,
                            maxDiagramSizeKB: 100,
                            defaultBTLDays: 7,
                            maxBTLDays: 7,
                            canShare: false,
                            canEncrypt: false
                        };
                        await showAlert('🆓 Free Tier Active', 'Free tier activated!\n\nLimits: 5 diagrams, 7 days storage, basic features only');
                        return true;

                    default:
                        return false;
                }
            }

            async function updateUserInfo() {
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (walletAddress) {
                        headers['x-wallet-address'] = walletAddress;
                    }
                    if (custodialId) {
                        headers['x-custodial-id'] = custodialId;
                    }

                    const response = await fetch(`${BACKEND_URL}/api/user/info`, { headers });
                    const data = await response.json();

                    if (data.success) {
                        userLimits = data.limits;
                        console.log('✅ User info updated:', data);
                    }
                } catch (error) {
                    console.warn('Failed to update user info:', error);
                }
            }

            // Save current diagram to Golem DB with sharding support
            const saveToGolemDB = withOperationLock(async function() {
                try {
                    if (!(await ensureAuthentication())) return;

                    const title = await showPrompt('📝 Enter Title', 'Enter diagram title:', 'My Diagram');
                    if (!title) return;

                    // Check encryption capability based on user tier
                    let encryptThisDiagram = encryptionEnabled;
                    let encryptionPassword = defaultEncryptionPassword;

                    if (userLimits && !userLimits.canEncrypt) {
                        encryptThisDiagram = false;
                        encryptionPassword = null;
                        if (encryptionEnabled) {
                            await showAlert('🔒 Encryption Unavailable', `Encryption is not available for ${userTier} tier. Upgrade to Wallet tier for encryption support.`);
                        }
                    } else if (!encryptionEnabled) {
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

                    // Try SDK mode first with MetaMask, fallback to backend
                    try {
                        // Ensure correct network first
                        await ensureGolemNetwork();

                        const sdkAvailable = await checkSDKMode();
                        if (sdkAvailable) {
                            console.log('🚀 Using SDK mode for direct MetaMask signing');
                            const result = await saveToGolemDBViaSdk(xmlString, diagramId, title.trim(), walletAddress, encryptThisDiagram);
                            const explorerUrl = `https://explorer.https://kaolin.hoodi.arkiv.network/rpc/entity/${result.entityKey}`;
                            await showAlert('✅ Diagram Saved', `Diagram saved directly to Golem DB!\n\nDiagram ID: ${result.diagramId}\nEntity Key: <a href="${explorerUrl}" target="_blank" style="color: #4A90E2; text-decoration: underline;">${result.entityKey}</a>`);
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

                ui.spinner.spin(document.body, 'Saving to Golem DB...');

                const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/export`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Wallet-Address': walletAddress
                    },
                    body: JSON.stringify(saveData)
                }, 30000);

                const result = await response.json();

                // Check if backend wants frontend to handle transaction (no backend private key)
                if (result.requiresFrontendTransaction) {
                    ui.spinner.stop();
                    console.log('🔄 Backend requires frontend transaction - using MetaMask');

                    // Use the SDK directly for MetaMask transaction
                    if (!golemClient) {
                        throw new Error('MetaMask not connected. Please connect your wallet first.');
                    }

                    ui.spinner.spin(document.body, 'Saving with MetaMask...');

                    const diagramData = result.diagramData;
                    const entityResult = await golemClient.createEntity(
                        JSON.stringify(diagramData),
                        {
                            type: 'diagram',
                            title: diagramData.title,
                            author: diagramData.author,
                            version: String(diagramData.version),
                            timestamp: String(diagramData.timestamp),
                            diagramId: diagramData.id
                        }
                    );

                    ui.spinner.stop();

                    const explorerUrl = `https://explorer.https://kaolin.hoodi.arkiv.network/rpc/entity/${entityResult.entityKey}`;
                    await showAlert('✅ Diagram Saved', `Diagram saved directly to Golem DB!\n\nDiagram ID: ${diagramData.id}\nEntity Key: <a href="${explorerUrl}" target="_blank" style="color: #4A90E2; text-decoration: underline;">${entityResult.entityKey}</a>`);
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }

                ui.spinner.stop();

                if (result.success) {
                    const explorerUrl = `https://explorer.https://kaolin.hoodi.arkiv.network/rpc/entity/${result.entityKey}`;
                    await showAlert('✅ Diagram Saved', `Diagram saved to Golem DB!\n\nDiagram ID: ${result.diagramId}\nEntity Key: <a href="${explorerUrl}" target="_blank" style="color: #4A90E2; text-decoration: underline;">${result.entityKey}</a>`);
                } else {
                    throw new Error(result.error || 'Save failed');
                }
            }

            // Save sharded document (over 128KB)
            async function saveShardedDocument(xmlString, diagramId, title, author, encrypted = false, encryptionPassword = null) {
                const chunks = createDocumentChunks(xmlString, diagramId, title, author);

                ui.spinner.spin(document.body, `Saving ${chunks.length} chunks to Golem DB...`);

                console.log(`💾 Saving ${chunks.length} chunks for diagram ${diagramId}`);

                try {
                    // Save all chunks
                    const chunkResults = [];
                    for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i];

                        // Update progress
                        ui.spinner.spin(document.body, `Saving chunk ${i + 1}/${chunks.length} to Golem DB...`);

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

                    await showAlert('✅ Large Diagram Saved', `Large diagram saved to Golem DB!\n\nDiagram ID: ${diagramId}\nChunks: ${chunks.length}\nTotal size: ${Math.round(new Blob([xmlString]).size/1024)}KB`);

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

            // Enhanced dialog styles
            function createEnhancedDialog(title, maxWidth = '500px') {
                // Create overlay with animation
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(5px);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                `;

                // Create dialog with enhanced styling
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                    border-radius: 16px;
                    padding: 0;
                    max-width: ${maxWidth};
                    width: 90%;
                    max-height: 85vh;
                    overflow: hidden;
                    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.8);
                    transform: scale(0.9) translateY(20px);
                    transition: transform 0.3s ease;
                `;

                // Enhanced header with gradient
                const header = document.createElement('div');
                header.style.cssText = `
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-radius: 16px 16px 0 0;
                `;

                const titleEl = document.createElement('h3');
                titleEl.innerHTML = `<span style="font-size: 20px; margin-right: 8px;">📊</span>${title}`;
                titleEl.style.cssText = `
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.1);
                `;

                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '✕';
                closeBtn.style.cssText = `
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    font-size: 18px;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s ease;
                    font-weight: bold;
                `;
                closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255,255,255,0.3)';
                closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
                closeBtn.onclick = () => {
                    overlay.style.opacity = '0';
                    dialog.style.transform = 'scale(0.9) translateY(20px)';
                    setTimeout(() => safeRemoveElement(overlay), 300);
                };

                header.appendChild(titleEl);
                header.appendChild(closeBtn);

                // Content container
                const content = document.createElement('div');
                content.style.cssText = `
                    padding: 24px;
                    max-height: calc(85vh - 80px);
                    overflow-y: auto;
                `;

                dialog.appendChild(header);
                dialog.appendChild(content);
                overlay.appendChild(dialog);

                // Show with animation
                setTimeout(() => {
                    overlay.style.opacity = '1';
                    dialog.style.transform = 'scale(1) translateY(0)';
                }, 10);

                return { overlay, dialog, content, header };
            }

            // User tier badge component
            function createUserTierBadge() {
                const tierInfo = {
                    free: { color: '#6c757d', icon: '🆓', label: 'Free' },
                    custodial: { color: '#28a745', icon: '👤', label: 'Custodial' },
                    wallet: { color: '#007bff', icon: '👛', label: 'Wallet' }
                };

                const tier = tierInfo[userTier] || tierInfo.free;

                const badge = document.createElement('div');
                badge.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    background: ${tier.color};
                    color: white;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-left: 8px;
                `;
                badge.innerHTML = `${tier.icon} ${tier.label}`;
                return badge;
            }

            // Show diagram selection dialog with enhanced UI
            function showDiagramDialog(diagrams) {
                const { overlay, content } = createEnhancedDialog('Your Diagrams', '600px');

                // Add user tier badge to header
                const header = overlay.querySelector('h3');
                header.appendChild(createUserTierBadge());

                // Usage stats if available
                if (userLimits) {
                    const stats = document.createElement('div');
                    stats.style.cssText = `
                        background: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 20px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;

                    const diagramCount = diagrams.length;
                    const maxDiagrams = userLimits.maxDiagrams;
                    const percentage = (diagramCount / maxDiagrams) * 100;

                    stats.innerHTML = `
                        <div>
                            <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">Storage Usage</div>
                            <div style="font-size: 14px; color: #6c757d;">${diagramCount} of ${maxDiagrams} diagrams</div>
                        </div>
                        <div style="width: 100px;">
                            <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                                <div style="background: ${percentage > 80 ? '#dc3545' : percentage > 60 ? '#ffc107' : '#28a745'}; height: 100%; width: ${Math.min(percentage, 100)}%; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    `;
                    content.appendChild(stats);
                }

                // Search and filter bar
                const searchContainer = document.createElement('div');
                searchContainer.style.cssText = `
                    background: white;
                    border: 2px solid #e9ecef;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                `;

                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.placeholder = '🔍 Search diagrams...';
                searchInput.style.cssText = `
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid #ced4da;
                    border-radius: 8px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s ease;
                `;
                searchInput.onfocus = () => searchInput.style.borderColor = '#667eea';
                searchInput.onblur = () => searchInput.style.borderColor = '#ced4da';

                searchContainer.appendChild(searchInput);
                content.appendChild(searchContainer);

                // Create diagram list container
                const diagramList = document.createElement('div');
                diagramList.style.cssText = `
                    max-height: 400px;
                    overflow-y: auto;
                `;

                function renderDiagrams(filteredDiagrams) {
                    diagramList.innerHTML = '';

                    if (filteredDiagrams.length === 0) {
                        const emptyState = document.createElement('div');
                        emptyState.style.cssText = `
                            text-align: center;
                            padding: 40px 20px;
                            color: #6c757d;
                        `;
                        emptyState.innerHTML = `
                            <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No diagrams found</div>
                            <div style="font-size: 14px;">Try adjusting your search or create a new diagram</div>
                        `;
                        diagramList.appendChild(emptyState);
                        return;
                    }

                    filteredDiagrams.forEach((diagram, index) => {
                        const item = document.createElement('div');
                        item.style.cssText = `
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 16px;
                            border: 2px solid #e9ecef;
                            border-radius: 12px;
                            margin-bottom: 12px;
                            background: white;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            position: relative;
                        `;

                        item.onmouseover = () => {
                            item.style.borderColor = '#667eea';
                            item.style.transform = 'translateY(-2px)';
                            item.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                        };
                        item.onmouseout = () => {
                            item.style.borderColor = '#e9ecef';
                            item.style.transform = 'translateY(0)';
                            item.style.boxShadow = 'none';
                        };

                        const info = document.createElement('div');
                        info.style.cssText = `flex: 1; min-width: 0;`;

                        const titleEl = document.createElement('div');
                        titleEl.style.cssText = `
                            font-weight: 600;
                            font-size: 16px;
                            color: #212529;
                            margin-bottom: 6px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        `;
                        titleEl.textContent = diagram.title;

                        const metaEl = document.createElement('div');
                        metaEl.style.cssText = `
                            font-size: 13px;
                            color: #6c757d;
                            display: flex;
                            gap: 12px;
                            flex-wrap: wrap;
                        `;
                        metaEl.innerHTML = `
                            <span>📅 ${new Date(diagram.timestamp).toLocaleDateString()}</span>
                            <span>👤 ${diagram.author}</span>
                            <span>🔗 v${diagram.version}</span>
                        `;

                        info.appendChild(titleEl);
                        info.appendChild(metaEl);

                        const actions = document.createElement('div');
                        actions.style.cssText = `
                            display: flex;
                            gap: 8px;
                            opacity: 0.7;
                            transition: opacity 0.2s ease;
                        `;

                        item.onmouseover = () => {
                            item.style.borderColor = '#667eea';
                            item.style.transform = 'translateY(-2px)';
                            item.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                            actions.style.opacity = '1';
                        };
                        item.onmouseout = () => {
                            item.style.borderColor = '#e9ecef';
                            item.style.transform = 'translateY(0)';
                            item.style.boxShadow = 'none';
                            actions.style.opacity = '0.7';
                        };

                        // Load button
                        const loadBtn = document.createElement('button');
                        loadBtn.innerHTML = '📁';
                        loadBtn.title = 'Load diagram';
                        loadBtn.style.cssText = `
                            background: #28a745;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 8px 12px;
                            cursor: pointer;
                            font-size: 16px;
                            transition: all 0.2s ease;
                        `;
                        loadBtn.onclick = (e) => {
                            e.stopPropagation();
                            overlay.style.opacity = '0';
                            setTimeout(() => safeRemoveElement(overlay), 300);
                            loadDiagramById(diagram.id);
                        };

                        // Delete button
                        const deleteBtn = document.createElement('button');
                        deleteBtn.innerHTML = '🗑️';
                        deleteBtn.title = 'Delete diagram';
                        deleteBtn.style.cssText = `
                            background: #dc3545;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 8px 12px;
                            cursor: pointer;
                            font-size: 16px;
                            transition: all 0.2s ease;
                        `;
                        deleteBtn.onclick = (e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${diagram.title}"?`)) {
                                deleteDiagramById(diagram.id);
                                overlay.style.opacity = '0';
                                setTimeout(() => safeRemoveElement(overlay), 300);
                            }
                        };

                        actions.appendChild(loadBtn);
                        actions.appendChild(deleteBtn);

                        item.appendChild(info);
                        item.appendChild(actions);

                        // Click anywhere on item to load
                        info.onclick = () => {
                            overlay.style.opacity = '0';
                            setTimeout(() => safeRemoveElement(overlay), 300);
                            loadDiagramById(diagram.id);
                        };

                        diagramList.appendChild(item);
                    });
                }

                // Initial render
                renderDiagrams(diagrams);

                // Search functionality
                let searchTimeout;
                searchInput.oninput = () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        const query = searchInput.value.toLowerCase();
                        const filtered = diagrams.filter(diagram =>
                            diagram.title.toLowerCase().includes(query) ||
                            diagram.author.toLowerCase().includes(query)
                        );
                        renderDiagrams(filtered);
                    }, 300);
                };

                content.appendChild(diagramList);
                document.body.appendChild(overlay);
            }


            // Load diagram function
            async function loadDiagram(selectedDiagram) {
                try {
                    ui.spinner.spin(document.body, 'Loading diagram...');

                    let loadResult;

                    // Try SDK mode first with MetaMask
                    try {
                        await ensureGolemNetwork();
                        const sdkAvailable = await checkSDKMode();
                        if (sdkAvailable) {
                            console.log('🚀 Using SDK mode for loading with MetaMask');
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

            // Advanced diagram dialog with search functionality
            // Show versions dialog for a specific diagram
            async function showVersionsDialog(diagram) {
                try {
                    ui.spinner.spin(document.body, 'Loading versions...');

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/${diagram.id}/versions`, {
                        headers: walletAddress ? { 'X-Wallet-Address': walletAddress } : {}
                    }, 15000);

                    ui.spinner.stop();

                    if (!response.ok) {
                        throw new Error(`Failed to load versions: ${response.status}`);
                    }

                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to load versions');
                    }

                    const versions = result.data || [];
                    showVersionsDialogUI(diagram, versions);

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Error loading versions:', error);
                    await showAlert('❌ Versions Load Failed', error.message);
                }
            }

            // Show versions dialog UI
            function showVersionsDialogUI(diagram, versions) {
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
                    border-radius: 12px;
                    padding: 25px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 80%;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                `;

                // Title
                const title = document.createElement('h3');
                title.style.cssText = `margin: 0 0 20px 0; color: #333; font-size: 1.4em;`;
                title.textContent = `📋 Version History: ${diagram.title}`;

                // Info
                const info = document.createElement('div');
                info.style.cssText = `margin-bottom: 20px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 14px; color: #666;`;
                info.innerHTML = `
                    <strong>Diagram ID:</strong> ${diagram.id}<br>
                    <strong>Total Versions:</strong> ${versions.length}
                `;

                // Versions container
                const versionsContainer = document.createElement('div');
                versionsContainer.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 20px;
                    border: 1px solid #e9ecef;
                    border-radius: 6px;
                `;

                // Render versions
                if (versions.length === 0) {
                    versionsContainer.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: #666;">
                            No versions found for this diagram.
                        </div>
                    `;
                } else {
                    versions.forEach((version, index) => {
                        const versionItem = document.createElement('div');
                        versionItem.style.cssText = `
                            padding: 15px;
                            border-bottom: ${index < versions.length - 1 ? '1px solid #e9ecef' : 'none'};
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            ${index === 0 ? 'background: #f0f8ff;' : ''}
                        `;

                        const versionInfo = document.createElement('div');
                        versionInfo.style.cssText = `flex: 1;`;
                        versionInfo.innerHTML = `
                            <div style="font-weight: bold; color: #333; margin-bottom: 5px;">
                                Version ${version.version} ${index === 0 ? '(Current)' : ''}
                            </div>
                            <div style="font-size: 12px; color: #666; line-height: 1.4;">
                                📅 ${new Date(version.timestamp).toLocaleDateString()} ${new Date(version.timestamp).toLocaleTimeString()}<br>
                                👤 ${version.author}<br>
                                🔑 ${version.entityKey ? version.entityKey.substring(0, 16) + '...' : 'N/A'}
                            </div>
                        `;

                        const versionActions = document.createElement('div');
                        versionActions.style.cssText = `display: flex; gap: 8px; margin-left: 15px;`;

                        // Load this version button
                        const loadVersionBtn = document.createElement('button');
                        loadVersionBtn.textContent = '📂 Open';
                        loadVersionBtn.style.cssText = `
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 11px;
                        `;
                        loadVersionBtn.onclick = () => {
                            safeRemoveElement(overlay);
                            loadDiagramVersion(version);
                        };

                        versionActions.appendChild(loadVersionBtn);
                        versionItem.appendChild(versionInfo);
                        versionItem.appendChild(versionActions);
                        versionsContainer.appendChild(versionItem);
                    });
                }

                // Close button
                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Close';
                closeBtn.style.cssText = `
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    align-self: flex-end;
                `;
                closeBtn.onclick = () => safeRemoveElement(overlay);

                dialog.appendChild(title);
                dialog.appendChild(info);
                dialog.appendChild(versionsContainer);
                dialog.appendChild(closeBtn);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // Close on background click
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        safeRemoveElement(overlay);
                    }
                };
            }

            // Load a specific version of a diagram
            async function loadDiagramVersion(version) {
                try {
                    ui.spinner.spin(document.body, 'Loading diagram version...');

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/import/${version.entityKey}`, {
                        headers: walletAddress ? { 'X-Wallet-Address': walletAddress } : {}
                    }, 15000);

                    ui.spinner.stop();

                    if (!response.ok) {
                        throw new Error(`Failed to load version: ${response.status}`);
                    }

                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to load diagram version');
                    }

                    const diagramData = result.data;
                    if (!diagramData || !diagramData.content) {
                        throw new Error('Invalid diagram data received');
                    }

                    // Load the diagram into draw.io
                    const graph = ui.editor.graph;
                    const doc = mxUtils.parseXml(diagramData.content);
                    const codec = new mxCodec(doc);
                    graph.getModel().beginUpdate();
                    try {
                        graph.getModel().clear();
                        codec.decode(doc.documentElement, graph.getModel());
                    } finally {
                        graph.getModel().endUpdate();
                    }

                    // Update title
                    if (ui.getCurrentFile()) {
                        ui.getCurrentFile().setTitle(`${diagramData.title} (v${version.version})`);
                    }

                    await showAlert('✅ Version Loaded', `Successfully loaded version ${version.version} of "${diagramData.title}"`);

                } catch (error) {
                    ui.spinner.stop();
                    console.error('Error loading diagram version:', error);
                    await showAlert('❌ Version Load Failed', error.message);
                }
            }

            function showAdvancedDiagramDialog(initialDiagrams) {
                console.log('🎨 Creating file manager dialog UI...');
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
                    border-radius: 12px;
                    padding: 25px;
                    max-width: 700px;
                    width: 90%;
                    max-height: 85%;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                `;

                // Header with title and close button
                const header = document.createElement('div');
                header.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 15px;
                `;

                const title = document.createElement('h3');
                title.textContent = '📂 Open from Golem DB';
                title.style.cssText = 'margin: 0; color: #333; font-size: 1.5em;';

                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '✖';
                closeBtn.style.cssText = `
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #666;
                    padding: 5px;
                `;
                closeBtn.onclick = () => safeRemoveElement(overlay);

                header.appendChild(title);
                header.appendChild(closeBtn);

                // Search section
                const searchSection = document.createElement('div');
                searchSection.style.cssText = `margin-bottom: 20px;`;

                searchSection.innerHTML = `
                    <div style="margin-bottom: 15px;">
                        <input type="text" id="searchQuery" placeholder="Search diagrams..."
                               style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px;">
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <select id="sortBy" style="padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="timestamp">Sort by Date</option>
                            <option value="title">Sort by Title</option>
                            <option value="author">Sort by Author</option>
                        </select>
                        <select id="sortOrder" style="padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="desc">Newest First</option>
                            <option value="asc">Oldest First</option>
                        </select>
                        <button id="advancedSearchBtn" style="background: #667eea; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                            🔍 Advanced
                        </button>
                    </div>
                `;

                // Advanced search panel (initially hidden)
                const advancedPanel = document.createElement('div');
                advancedPanel.id = 'advancedPanel';
                advancedPanel.style.cssText = `
                    display: none;
                    margin-top: 15px;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 5px;
                    border: 1px solid #e9ecef;
                `;

                advancedPanel.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <input type="text" id="titleSearch" placeholder="Title contains..."
                               style="padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
                        <input type="text" id="authorSearch" placeholder="Author contains..."
                               style="padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <input type="date" id="dateFrom"
                               style="padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
                        <input type="date" id="dateTo"
                               style="padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
                    </div>
                `;

                // Results container
                const resultsContainer = document.createElement('div');
                resultsContainer.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid #eee;
                    border-radius: 5px;
                    max-height: 400px;
                `;

                // Assemble dialog
                dialog.appendChild(header);
                dialog.appendChild(searchSection);
                dialog.appendChild(advancedPanel);
                dialog.appendChild(resultsContainer);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                let currentDiagrams = initialDiagrams;

                // Function to render diagram list
                function renderDiagrams(diagrams) {
                    resultsContainer.innerHTML = '';

                    if (!diagrams || diagrams.length === 0) {
                        resultsContainer.innerHTML = `
                            <div style="padding: 40px; text-align: center; color: #666;">
                                📂 No diagrams found matching your search.
                            </div>
                        `;
                        return;
                    }

                    diagrams.forEach((diagram, index) => {
                        const item = document.createElement('div');
                        item.style.cssText = `
                            display: flex;
                            padding: 15px;
                            border-bottom: 1px solid #eee;
                            cursor: pointer;
                            transition: background 0.2s;
                        `;
                        item.onmouseenter = () => item.style.background = '#f0f8ff';
                        item.onmouseleave = () => item.style.background = 'white';

                        const info = document.createElement('div');
                        info.style.cssText = `flex: 1;`;

                        const titleElement = document.createElement('div');
                        titleElement.style.cssText = `font-weight: bold; margin-bottom: 5px; color: #333;`;
                        titleElement.textContent = diagram.title;

                        const details = document.createElement('div');
                        details.style.cssText = `font-size: 12px; color: #666; line-height: 1.4;`;

                        let detailsHtml = `
                            📅 ${new Date(diagram.timestamp).toLocaleDateString()} ${new Date(diagram.timestamp).toLocaleTimeString()}<br>
                            👤 ${diagram.author}
                        `;

                        if (diagram.score !== undefined) {
                            detailsHtml += `<br>⭐ Relevance: ${(diagram.score * 100).toFixed(0)}%`;
                        }

                        if (diagram.excerpt && diagram.excerpt !== diagram.title) {
                            detailsHtml += `<br>📝 "${diagram.excerpt}"`;
                        }

                        if (diagram.entityKey) {
                            detailsHtml += `<br>🔑 ${diagram.entityKey.substring(0, 16)}...`;
                        }

                        details.innerHTML = detailsHtml;

                        info.appendChild(titleElement);
                        info.appendChild(details);

                        // Action buttons container
                        const actionsContainer = document.createElement('div');
                        actionsContainer.style.cssText = `display: flex; flex-direction: column; gap: 5px; margin-left: 10px;`;

                        // Load button
                        const loadBtn = document.createElement('button');
                        loadBtn.textContent = '📂 Open';
                        loadBtn.style.cssText = `
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 8px 15px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            width: 100px;
                        `;
                        loadBtn.onclick = (e) => {
                            e.stopPropagation();
                            safeRemoveElement(overlay);
                            loadDiagram(diagram);
                        };

                        // Versions button
                        const versionsBtn = document.createElement('button');
                        versionsBtn.textContent = '📋 Versions';
                        versionsBtn.style.cssText = `
                            background: #6f42c1;
                            color: white;
                            border: none;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 11px;
                            width: 100px;
                        `;
                        versionsBtn.onclick = (e) => {
                            e.stopPropagation();
                            showVersionsDialog(diagram);
                        };

                        actionsContainer.appendChild(loadBtn);
                        actionsContainer.appendChild(versionsBtn);

                        item.appendChild(info);
                        item.appendChild(actionsContainer);

                        // Load on click
                        item.onclick = () => {
                            safeRemoveElement(overlay);
                            loadDiagram(diagram);
                        };

                        resultsContainer.appendChild(item);
                    });
                }

                // Search function
                async function performSearch() {
                    const query = document.getElementById('searchQuery').value.trim();
                    const title = document.getElementById('titleSearch')?.value.trim();
                    const author = document.getElementById('authorSearch')?.value.trim();
                    const dateFrom = document.getElementById('dateFrom')?.value;
                    const dateTo = document.getElementById('dateTo')?.value;
                    const sortBy = document.getElementById('sortBy').value;
                    const sortOrder = document.getElementById('sortOrder').value;

                    // If no search criteria, show all diagrams
                    if (!query && !title && !author && !dateFrom && !dateTo) {
                        renderDiagrams(initialDiagrams);
                        return;
                    }

                    try {
                        ui.spinner.spin(document.body, 'Searching...');

                        const params = new URLSearchParams();
                        if (query) params.append('query', query);
                        if (title) params.append('title', title);
                        if (author) params.append('author', author);
                        if (dateFrom) params.append('dateFrom', new Date(dateFrom).getTime().toString());
                        if (dateTo) params.append('dateTo', new Date(dateTo).getTime().toString());
                        params.append('sortBy', sortBy);
                        params.append('sortOrder', sortOrder);

                        const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/search?${params}`, {
                            headers: {
                                'X-Wallet-Address': walletAddress
                            }
                        }, 15000);

                        ui.spinner.stop();

                        if (!response.ok) {
                            throw new Error(`Search error: ${response.status}`);
                        }

                        const result = await response.json();
                        if (result.success) {
                            renderDiagrams(result.data);
                        } else {
                            throw new Error(result.error || 'Search failed');
                        }

                    } catch (error) {
                        ui.spinner.stop();
                        console.error('Search error:', error);
                        resultsContainer.innerHTML = `
                            <div style="padding: 20px; text-align: center; color: #dc3545;">
                                ❌ Search failed: ${error.message}
                            </div>
                        `;
                    }
                }

                // Event handlers
                document.getElementById('searchQuery').addEventListener('input', performSearch);
                document.getElementById('sortBy').addEventListener('change', performSearch);
                document.getElementById('sortOrder').addEventListener('change', performSearch);

                // Advanced search toggle
                document.getElementById('advancedSearchBtn').onclick = () => {
                    const panel = document.getElementById('advancedPanel');
                    const btn = document.getElementById('advancedSearchBtn');
                    if (panel.style.display === 'none') {
                        panel.style.display = 'block';
                        btn.textContent = '🔼 Hide Advanced';
                    } else {
                        panel.style.display = 'none';
                        btn.textContent = '🔍 Advanced';
                    }
                };

                // Advanced search field handlers
                setTimeout(() => {
                    const titleSearch = document.getElementById('titleSearch');
                    const authorSearch = document.getElementById('authorSearch');
                    const dateFrom = document.getElementById('dateFrom');
                    const dateTo = document.getElementById('dateTo');

                    if (titleSearch) titleSearch.addEventListener('input', performSearch);
                    if (authorSearch) authorSearch.addEventListener('input', performSearch);
                    if (dateFrom) dateFrom.addEventListener('change', performSearch);
                    if (dateTo) dateTo.addEventListener('change', performSearch);
                }, 100);

                // Click outside to close
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        safeRemoveElement(overlay);
                    }
                };

                // Initial render
                renderDiagrams(currentDiagrams);
            }

            // Show load dialog
            const showLoadDialog = withOperationLock(async function() {
                try {
                    console.log('🔍 Opening file manager - checking authentication...');
                    const authenticated = await ensureAuthentication();
                    if (!authenticated) {
                        console.log('❌ Authentication failed or cancelled');
                        return;
                    }
                    console.log('✅ Authentication successful, loading diagrams...');

                    ui.spinner.spin(document.body, 'Loading diagrams...');

                    const response = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/list?limit=50&offset=0`, {
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
                        await showAlert('📂 No Diagrams Found', 'No saved diagrams found.\n\nSave a diagram first using "Save to Golem DB"!');
                        return;
                    }

                    // Create HTML dialog with proper UI and search
                    const diagrams = result.data;
                    console.log('📋 Opening file manager dialog with', diagrams.length, 'diagrams');
                    showAdvancedDiagramDialog(diagrams);

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

            // Alias for storage provider integration
            const showGolemDBLoadDialog = showLoadDialog;

            // Share dialog function
            const showShareDialog = withOperationLock(async function() {
                try {
                    // Check if there's a current diagram to share
                    const graph = ui.editor.graph;
                    if (!graph || graph.getModel().root.getChildCount() === 0) {
                        await showAlert('❌ No Diagram to Share', 'Please create or open a diagram first before sharing.');
                        return;
                    }

                    // Check if wallet is connected for auth
                    if (!(await ensureAuthentication())) return;

                    // Get current diagram info
                    const title = ui.getCurrentFile()?.getTitle() || 'Untitled Diagram';

                    // Create share dialog
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
                        <h2 style="margin-top: 0; color: #333; font-size: 24px; margin-bottom: 20px;">🔗 Share Diagram</h2>

                        <div style="margin: 20px 0;">
                            <h3 style="color: #555; margin-bottom: 10px;">📊 Diagram: ${escapeHtml(title)}</h3>
                            <p style="color: #666; margin-bottom: 20px;">Create a shareable link for this diagram.</p>
                        </div>

                        <div style="margin: 20px 0;">
                            <label style="display: block; margin: 10px 0; padding: 15px; border: 2px solid #e1e5e9; border-radius: 8px; cursor: pointer;">
                                <input type="radio" name="shareType" value="public" checked style="margin-right: 10px;">
                                <strong>🌐 Public Link</strong>
                                <div style="margin-top: 5px; color: #666; font-size: 14px;">Anyone with the link can view the diagram</div>
                            </label>

                            <label style="display: block; margin: 10px 0; padding: 15px; border: 2px solid #e1e5e9; border-radius: 8px; cursor: pointer;">
                                <input type="radio" name="shareType" value="private" style="margin-right: 10px;">
                                <strong>🔒 Private Link</strong>
                                <div style="margin-top: 5px; color: #666; font-size: 14px;">Only authenticated users can view</div>
                            </label>
                        </div>

                        <div style="margin: 20px 0;">
                            <label style="display: block; margin-bottom: 10px; color: #555; font-weight: bold;">⏰ Link Expiration:</label>
                            <select id="expirationDays" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                                <option value="">Never expires</option>
                                <option value="1">1 day</option>
                                <option value="7" selected>7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                            </select>
                        </div>

                        <div style="margin-top: 30px; text-align: center;">
                            <button id="create-share-link" style="background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-right: 10px;">
                                🔗 Create Share Link
                            </button>
                            <button id="cancel-share" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px;">
                                Cancel
                            </button>
                        </div>

                        <div id="share-result" style="margin-top: 20px; display: none;"></div>
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

                    // Handle radio button selection
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

                    // Event handlers
                    content.querySelector('#cancel-share').onclick = () => {
                        modal.remove();
                        style.remove();
                    };

                    content.querySelector('#create-share-link').onclick = async () => {
                        try {
                            const shareType = content.querySelector('input[name="shareType"]:checked').value;
                            const expirationDays = content.querySelector('#expirationDays').value;

                            // First, save the diagram to get a diagram ID
                            ui.spinner.spin(document.body, 'Saving diagram...');

                            // Get diagram data
                            const diagramData = {
                                title: title,
                                author: walletAddress || 'anonymous',
                                content: mxUtils.getXml(ui.editor.getGraphXml())
                            };

                            // Save diagram first
                            const saveResponse = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/export`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Wallet-Address': walletAddress
                                },
                                body: JSON.stringify(diagramData)
                            }, 30000);

                            if (!saveResponse.ok) {
                                throw new Error(`Save error: ${saveResponse.status} ${saveResponse.statusText}`);
                            }

                            const saveResult = await saveResponse.json();

                            let diagramId;

                            // Handle case where backend requires frontend transaction
                            if (saveResult.requiresFrontendTransaction) {
                                ui.spinner.stop();
                                console.log('🔄 Backend requires frontend transaction for sharing - using MetaMask');

                                // Use the SDK directly for MetaMask transaction
                                if (!golemClient) {
                                    throw new Error('MetaMask not connected. Please connect your wallet first.');
                                }

                                ui.spinner.spin(document.body, 'Saving with MetaMask...');

                                const diagramDataFromBackend = saveResult.diagramData;
                                const entityResult = await golemClient.createEntity(
                                    JSON.stringify(diagramDataFromBackend),
                                    {
                                        type: 'diagram',
                                        title: diagramDataFromBackend.title,
                                        author: diagramDataFromBackend.author,
                                        version: String(diagramDataFromBackend.version),
                                        timestamp: String(diagramDataFromBackend.timestamp),
                                        diagramId: diagramDataFromBackend.id
                                    }
                                );

                                // Use the diagram ID from the saved data
                                diagramId = diagramDataFromBackend.id;
                                console.log(`📊 Diagram saved via MetaMask with ID: ${diagramId}`);
                            } else {
                                // Normal backend save
                                if (!saveResult.success) {
                                    throw new Error(saveResult.error || 'Save failed');
                                }

                                diagramId = saveResult.diagramId;
                                if (!diagramId) {
                                    throw new Error('No diagram ID returned from save operation');
                                }
                            }

                            // Create share token
                            ui.spinner.spin(document.body, 'Creating share link...');

                            const shareData = {
                                isPublic: shareType === 'public',
                                expiresInDays: expirationDays ? parseInt(expirationDays) : undefined
                            };

                            const shareResponse = await fetchWithTimeout(`${BACKEND_URL}/api/diagrams/${diagramId}/share`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Wallet-Address': walletAddress
                                },
                                body: JSON.stringify(shareData)
                            }, 15000);

                            if (!shareResponse.ok) {
                                throw new Error(`Share error: ${shareResponse.status} ${shareResponse.statusText}`);
                            }

                            const shareResult = await shareResponse.json();
                            ui.spinner.stop();

                            if (!shareResult.success) {
                                throw new Error(shareResult.error || 'Share failed');
                            }

                            // Show success result
                            const resultDiv = content.querySelector('#share-result');
                            resultDiv.style.display = 'block';
                            resultDiv.innerHTML = `
                                <div style="padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; color: #155724;">
                                    <h4 style="margin-top: 0;">✅ Share Link Created!</h4>
                                    <p style="margin: 10px 0;"><strong>Share URL:</strong></p>
                                    <div style="background: white; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 10px 0;">${shareResult.shareUrl}</div>
                                    <button onclick="navigator.clipboard.writeText('${shareResult.shareUrl}')" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer;">
                                        📋 Copy Link
                                    </button>
                                </div>
                            `;

                        } catch (error) {
                            ui.spinner.stop();
                            console.error('Share error:', error);
                            await showAlert('❌ Share Failed', `Failed to create share link:\n\n${error.message}`);
                        }
                    };

                    // Click outside to close
                    modal.onclick = (e) => {
                        if (e.target === modal) {
                            modal.remove();
                            style.remove();
                        }
                    };

                } catch (error) {
                    console.error('Share dialog error:', error);
                    await showAlert('❌ Share Error', `Failed to open share dialog:\n\n${error.message}`);
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

                    // Check if we're on the correct network first
                    const chainId = await safeMetaMaskRequest({ method: 'eth_chainId' });
                    const currentChainId = parseInt(chainId, 16);

                    if (currentChainId !== GOLEM_CONFIG.chainId) {
                        console.log(`⚠️ Wrong network. Current: ${currentChainId}, Expected: ${GOLEM_CONFIG.chainId}`);
                        ethBalance = 0;
                        return;
                    }

                    const balance = await safeMetaMaskRequest({
                        method: 'eth_getBalance',
                        params: [walletAddress, 'latest']
                    });

                    // Convert from wei to ETH
                    const ethValue = parseInt(balance, 16) / Math.pow(10, 18);
                    ethBalance = ethValue;
                    console.log('💰 TGOLEM Balance:', ethBalance.toFixed(8));
                } catch (error) {
                    console.warn('⚠️ Cannot fetch balance:', error.message);
                    ethBalance = 0;
                }
            }

            // Show configuration dialog
            async function showConfigDialog() {
                // Configuration can be accessed without wallet connection
                // User can set authentication preferences and other settings

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
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                `;

                const currentConfig = userConfig || {
                    btlDays: 100,
                    autoSave: false,
                    showBalance: true,
                    encryptByDefault: false,
                    encryptionPassword: '',
                    useTestnet: false,
                    testnetRpc: 'https://rpc.https://kaolin.hoodi.arkiv.network/rpc',
                    testnetChainId: 60138453025
                };

                dialog.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        <h3 style="margin: 0;">⚙️ Configuration</h3>
                        <button id="closeConfig" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">✖</button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">💰 Wallet Info:</div>
                        <div style="font-size: 12px; color: #666;">Address: ${walletAddress || 'Not connected'}</div>
                        <div style="font-size: 12px; color: #666;">Balance: ${walletAddress ? ethBalance.toFixed(8) + ' TGOLEM' : 'Connect wallet to see balance'}</div>
                    </div>

                    <div style="margin-bottom: 15px; border-top: 1px solid #eee; padding-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">🧪 Setup Golem DB Testnet</h4>

                        <div style="margin-bottom: 10px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" id="useTestnet" ${currentConfig.useTestnet ? 'checked' : ''} style="margin-right: 8px;">
                                <span>Enable Testnet Mode</span>
                            </label>
                            <div style="font-size: 11px; color: #666; margin-left: 20px; margin-top: 2px;">Use Golem DB testnet for development and testing</div>
                        </div>

                        <div id="testnetConfig" style="margin-left: 20px; ${currentConfig.useTestnet ? '' : 'display: none;'}">
                            <div style="margin-bottom: 8px;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px; font-size: 12px;">Testnet RPC URL:</label>
                                <input type="text" id="testnetRpc" value="${currentConfig.testnetRpc || 'https://rpc.https://kaolin.hoodi.arkiv.network/rpc'}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                            </div>
                            <div style="margin-bottom: 8px;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px; font-size: 12px;">Testnet Chain ID:</label>
                                <input type="number" id="testnetChainId" value="${currentConfig.testnetChainId || 60138453025}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px;">⏰ Custom BTL in time:</label>
                        <input type="number" id="btlDays" value="${currentConfig.btlDays}" min="1" max="365" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">How many days documents should be stored in Golem DB (default: 100 days)</div>
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

                    <!-- Connection Mode hidden - always use backend mode -->
                    <input type="hidden" name="connectionMode" value="backend">

                    <div style="margin-bottom: 15px; border-top: 1px solid #eee; padding-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">🔐 Authentication Preference</h4>
                        <div style="font-size: 11px; color: #666; margin-bottom: 10px;">Choose your preferred authentication method for saving diagrams:</div>

                        <div style="margin-bottom: 8px;">
                            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                                <input type="radio" name="authChoice" value="wallet" ${localStorage.getItem('golemdb-auth-choice') === 'wallet' ? 'checked' : ''} style="margin-right: 8px;">
                                <span><strong>🔗 MetaMask Wallet</strong> - Connect with MetaMask wallet</span>
                            </label>
                            <div style="font-size: 10px; color: #666; margin-left: 20px; margin-bottom: 5px;">Pay gas fees directly, full control of your data</div>

                            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 5px;">
                                <input type="radio" name="authChoice" value="custodial" ${localStorage.getItem('golemdb-auth-choice') === 'custodial' ? 'checked' : ''} style="margin-right: 8px;">
                                <span><strong>👤 Guest Mode</strong> - Quick start without wallet</span>
                            </label>
                            <div style="font-size: 10px; color: #666; margin-left: 20px; margin-bottom: 5px;">Backend handles transactions, limited storage and BTL</div>

                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="radio" name="authChoice" value="" ${!localStorage.getItem('golemdb-auth-choice') ? 'checked' : ''} style="margin-right: 8px;">
                                <span><strong>❓ Ask me each time</strong> - Show choice dialog for each save</span>
                            </label>
                            <div style="font-size: 10px; color: #666; margin-left: 20px;">No preference saved, flexible choice per save</div>
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
                document.getElementById('closeConfig').onclick = () => safeRemoveElement(overlay);
                document.getElementById('cancelConfig').onclick = () => safeRemoveElement(overlay);

                // Toggle testnet config visibility
                document.getElementById('useTestnet').onchange = function() {
                    const testnetConfig = document.getElementById('testnetConfig');
                    testnetConfig.style.display = this.checked ? 'block' : 'none';
                };

                document.getElementById('saveConfig').onclick = async () => {
                    const btlDays = parseInt(document.getElementById('btlDays').value);
                    const autoSave = document.getElementById('autoSave').checked;
                    const showBalance = document.getElementById('showBalance').checked;
                    const encryptByDefault = document.getElementById('encryptByDefault').checked;
                    const encryptionPassword = document.getElementById('encryptionPassword').value.trim();
                    const useTestnet = document.getElementById('useTestnet').checked;
                    const testnetRpc = document.getElementById('testnetRpc').value.trim();
                    const testnetChainId = parseInt(document.getElementById('testnetChainId').value);
                    if (btlDays < 1 || btlDays > 365) {
                        await showAlert('❌ Invalid Value', 'BTL Days must be between 1 and 365');
                        return;
                    }

                    // Connection mode is always 'backend' (hidden from UI)
                    const selectedMode = 'backend';
                    const selectedAuthChoice = document.querySelector('input[name="authChoice"]:checked')?.value || '';

                    // Save authentication preference
                    if (selectedAuthChoice) {
                        localStorage.setItem('golemdb-auth-choice', selectedAuthChoice);
                        console.log('💾 Saved auth choice:', selectedAuthChoice);
                    } else {
                        localStorage.removeItem('golemdb-auth-choice');
                        console.log('💾 Cleared auth choice - will ask each time');
                    }

                    // Force backend mode (Connection Mode is hidden)
                    console.log('🔄 Using backend relay mode...');
                    isSDKMode = false;
                    golemClient = null;

                    const newConfig = {
                        btlDays,
                        autoSave,
                        showBalance,
                        encryptByDefault,
                        encryptionPassword: encryptionPassword || undefined,
                        useTestnet,
                        testnetRpc: testnetRpc || undefined,
                        testnetChainId: testnetChainId || undefined
                    };
                    // Only save user config if wallet is connected
                    let saved = true;
                    if (walletAddress) {
                        saved = await saveUserConfig(newConfig);
                    }

                    if (saved) {
                        const authChoiceText = selectedAuthChoice === 'wallet' ? 'MetaMask Wallet' :
                                             selectedAuthChoice === 'custodial' ? 'Guest Mode' : 'Ask each time';
                        const saveMessage = walletAddress ?
                            `Configuration saved successfully!\n\nAuth Preference: ${authChoiceText}` :
                            `Preferences saved locally!\n\nAuth Preference: ${authChoiceText}\n\nNote: Connect wallet to save advanced settings to Golem DB.`;
                        await showAlert('✅ Configuration Saved', saveMessage);
                        safeRemoveElement(overlay);
                    } else {
                        await showAlert('❌ Save Failed', 'Failed to save configuration. Please try again.');
                    }
                };

                // Close on ESC key
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        safeRemoveElement(overlay);
                        document.removeEventListener('keydown', escHandler);
                    }
                });
            }

            // Open Golem DB Manager modal
            // Refresh diagram list in existing modal
            async function refreshDiagramList() {
                try {
                    const modal = document.querySelector('.golem-modal-overlay');
                    if (!modal) return; // No modal to refresh

                    console.log('🔄 Refreshing diagram list...');

                    // Get updated diagrams
                    const diagrams = await listUserDiagrams(walletAddress);

                    // Find the content div in the modal (last div in dialog)
                    const dialog = modal.querySelector('div[style*="border-radius: 8px"]');
                    if (!dialog) return;
                    const content = dialog.lastElementChild;
                    if (!content) return;

                    // Clear current content
                    content.innerHTML = '';

                    if (diagrams.length === 0) {
                        content.innerHTML = `
                            <div style="text-align: center; color: #666; padding: 40px;">
                                <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                                <h3 style="margin: 0 0 8px 0; color: #333;">No diagrams found</h3>
                                <p style="margin: 0;">Your Golem DB diagrams will appear here.</p>
                            </div>
                        `;
                    } else {
                        // Recreate diagram list
                        content.appendChild(createDiagramList(diagrams));
                    }

                    console.log('✅ Diagram list refreshed');
                } catch (error) {
                    console.error('Failed to refresh diagram list:', error);
                }
            }

            async function openWebManager() {
                if (!(await ensureAuthentication())) return;

                try {
                    console.log('🗂️ Opening Golem DB Manager...');

                    // Get user's diagrams
                    const diagrams = await listUserDiagrams(walletAddress);
                    showManagerModal(diagrams);

                } catch (error) {
                    console.error('Failed to open Golem DB Manager:', error);
                    await showAlert('❌ Manager Error', `Failed to load diagrams: ${error.message}`);
                }
            }

            // Show Golem DB Manager modal (using improved design like Open dialog)
            function showManagerModal(diagrams) {
                // Create overlay
                const overlay = document.createElement('div');
                overlay.className = 'golem-modal-overlay';
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
                    max-width: 700px;
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
                title.textContent = '🗂️ Golem DB Manager';
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
                closeBtn.onclick = () => safeRemoveElement(overlay);

                header.appendChild(title);
                header.appendChild(closeBtn);

                // Content
                const content = document.createElement('div');

                if (diagrams.length === 0) {
                    content.innerHTML = `
                        <div style="text-align: center; color: #666; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                            <h3 style="margin: 0 0 8px 0; color: #333;">No diagrams found</h3>
                            <p style="margin: 0;">Your Golem DB diagrams will appear here.</p>
                        </div>
                    `;
                } else {
                    // Create diagram list
                    content.appendChild(createDiagramList(diagrams));
                }

                dialog.appendChild(header);
                dialog.appendChild(content);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // Click outside to close
                overlay.onclick = (e) => {
                    if (e.target === overlay) safeRemoveElement(overlay);
                };
            }

            // Create diagram list with management options
            function createDiagramList(diagrams) {
                const list = document.createElement('div');
                list.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

                diagrams.forEach(diagram => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        padding: 16px;
                        background: #fafafa;
                        transition: all 0.2s;
                        cursor: pointer;
                    `;

                    item.onmouseenter = () => {
                        item.style.background = '#f0f0f0';
                        item.style.borderColor = '#667eea';
                    };
                    item.onmouseleave = () => {
                        item.style.background = '#fafafa';
                        item.style.borderColor = '#e0e0e0';
                    };

                    // Calculate disappear time
                    const createdDate = new Date(diagram.timestamp);
                    const btlDays = 100; // Default BTL is 100 days
                    const disappearDate = new Date(createdDate.getTime() + (btlDays * 24 * 60 * 60 * 1000));
                    const daysLeft = Math.max(0, Math.ceil((disappearDate - new Date()) / (24 * 60 * 60 * 1000)));

                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="flex-grow: 1;">
                                <h4 style="margin: 0 0 4px 0; color: #333; font-size: 16px; font-weight: 600;">
                                    📊 ${diagram.title || 'Untitled Diagram'}
                                </h4>
                                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                                    Created: ${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString()}
                                </div>
                                <div style="font-size: 12px; color: ${daysLeft < 7 ? '#e74c3c' : '#27ae60'}; font-weight: 500;">
                                    ⏱️ Disappears in: ${daysLeft} days
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                                <button onclick="openDiagram('${diagram.id}')"
                                        style="background: #27ae60; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Open diagram">
                                    📂 Open
                                </button>
                                <button onclick="renameDiagram('${diagram.id}', '${diagram.title}')"
                                        style="background: #f39c12; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Rename diagram">
                                    ✏️ Rename
                                </button>
                                <button onclick="changeBTL('${diagram.id}')"
                                        style="background: #3498db; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Change expiration time">
                                    ⏰ BTL
                                </button>
                                <button onclick="protectDiagram('${diagram.id}', '${diagram.title}')"
                                        style="background: #e74c3c; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Protect diagram content">
                                    🛡️ Protect
                                </button>
                                <button onclick="shareDiagram('${diagram.id}', '${diagram.title}')"
                                        style="background: #28a745; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Share diagram">
                                    📤 Share
                                </button>
                                <button onclick="openExplorer('${diagram.entityKey}')"
                                        style="background: #9b59b6; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="View in Golem Explorer">
                                    🔍 Explorer
                                </button>
                                <button onclick="deleteDiagram('${diagram.id}', '${diagram.title}')"
                                        style="background: #e74c3c; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                        title="Delete diagram">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    `;

                    list.appendChild(item);
                });

                return list;
            }

            // Get user's diagrams from backend
            async function listUserDiagrams() {
                const authRequired = await ensureAuthentication();
                if (!authRequired) {
                    throw new Error('Authentication required to list diagrams');
                }

                const headers = {
                    'Content-Type': 'application/json'
                };

                // Add appropriate authentication header
                if (walletConnected && walletAddress) {
                    headers['X-Wallet-Address'] = walletAddress;
                } else if (custodialId) {
                    headers['X-Custodial-Id'] = custodialId;
                }

                const response = await fetch(`${BACKEND_URL}/api/diagrams/list?limit=50&offset=0`, {
                    method: 'GET',
                    headers
                });

                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load diagrams');
                }

                return result.data || [];
            }

            // Import diagram helper function
            async function importDiagram(diagramId) {
                let loadResult = null;

                try {
                    if (connectionMode === 'sdk' && window.golemSdk) {
                        console.log('🔄 Using SDK mode for loading');
                        loadResult = await loadFromGolemDB(diagramId);
                    }
                } catch (sdkError) {
                    console.warn('⚠️ SDK load failed, falling back to backend:', sdkError);
                }

                // Fallback to backend if SDK failed
                if (!loadResult) {
                    console.log('🔄 Using backend mode for loading');
                    const loadResponse = await fetch(`${BACKEND_URL}/api/diagrams/import/${diagramId}`);
                    loadResult = await loadResponse.json();
                }

                if (loadResult.success) {
                    let content = loadResult.data.content;

                    // Check if diagram is encrypted
                    if (loadResult.data.encrypted) {
                        console.log('🔐 Diagram is encrypted, decrypting...');
                        try {
                            content = await decrypt(content);
                        } catch (decryptError) {
                            throw new Error('Failed to decrypt diagram');
                        }
                    }

                    return {
                        content: content,
                        title: loadResult.data.title,
                        id: diagramId
                    };
                } else {
                    throw new Error(loadResult.error || 'Failed to load diagram');
                }
            }

            // Manager functions - need to be global for onclick handlers
            window.openDiagram = async function(diagramId) {
                try {
                    console.log('📂 Opening diagram:', diagramId);
                    const diagramData = await importDiagram(diagramId);

                    if (diagramData && diagramData.content) {
                        // Close the manager modal
                        const modal = document.querySelector('.golem-modal-overlay');
                        if (modal) safeRemoveElement(modal);

                        // Load diagram into editor
                        const doc = mxUtils.parseXml(diagramData.content);
                        ui.editor.graph.getModel().beginUpdate();
                        try {
                            ui.editor.setGraphXml(doc.documentElement);
                        } finally {
                            ui.editor.graph.getModel().endUpdate();
                        }
                        await showAlert('✅ Diagram Opened', `"${diagramData.title}" loaded successfully!`);
                    }
                } catch (error) {
                    console.error('Failed to open diagram:', error);
                    await showAlert('❌ Open Failed', `Failed to open diagram: ${error.message}`);
                }
            };

            window.renameDiagram = async function(diagramId, currentTitle) {
                const newTitle = await showPrompt('✏️ Rename Diagram', 'Enter new title:', currentTitle);
                if (!newTitle || newTitle === currentTitle) return;

                try {
                    console.log('✏️ Renaming diagram:', diagramId, 'to:', newTitle);

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    // Add appropriate authentication header
                    if (walletConnected && walletAddress) {
                        headers['X-Wallet-Address'] = walletAddress;
                    } else if (custodialId) {
                        headers['X-Custodial-Id'] = custodialId;
                    }

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/${diagramId}/rename`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ newTitle })
                    });

                    const result = await response.json();

                    if (result.success) {
                        await showAlert('✅ Renamed', `Diagram renamed to "${newTitle}" successfully!`);
                        // Refresh diagram list without closing modal
                        await refreshDiagramList();
                    } else if (result.requiresFrontendTransaction) {
                        await showAlert('⚠️ MetaMask Required', result.message);
                        // Could implement frontend rename transaction here
                    } else {
                        throw new Error(result.error || 'Rename failed');
                    }
                } catch (error) {
                    console.error('Failed to rename diagram:', error);
                    await showAlert('❌ Rename Failed', `Failed to rename: ${error.message}`);
                }
            };

            window.changeBTL = async function(diagramId) {
                const newBTL = await showPrompt('⏰ Change Storage Time', 'Enter new BTL (days):', '100');
                if (!newBTL || isNaN(newBTL)) return;

                const newBTLDays = parseInt(newBTL);
                if (newBTLDays <= 0) {
                    await showAlert('❌ Invalid BTL', 'BTL must be a positive number of days.');
                    return;
                }

                try {
                    console.log('⏰ Changing BTL for diagram:', diagramId, 'to:', newBTLDays, 'days');

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    // Add appropriate authentication header
                    if (walletConnected && walletAddress) {
                        headers['X-Wallet-Address'] = walletAddress;
                    } else if (custodialId) {
                        headers['X-Custodial-Id'] = custodialId;
                    }

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/${diagramId}/btl`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ newBTLDays })
                    });

                    const result = await response.json();

                    if (result.success) {
                        await showAlert('✅ BTL Updated', `Diagram BTL changed to ${newBTLDays} days successfully!`);
                        // Refresh diagram list without closing modal
                        await refreshDiagramList();
                    } else if (result.requiresFrontendTransaction) {
                        await showAlert('⚠️ MetaMask Required', result.message);
                        // Could implement frontend BTL change transaction here
                    } else {
                        throw new Error(result.error || 'BTL change failed');
                    }
                } catch (error) {
                    console.error('Failed to change BTL:', error);
                    await showAlert('❌ BTL Change Failed', `Failed to change BTL: ${error.message}`);
                }
            };

            window.openExplorer = function(entityKey) {
                if (!entityKey) {
                    showAlert('⚠️ Explorer', 'Entity key not available for this diagram.');
                    return;
                }

                const explorerUrl = `${GOLEM_CONFIG.explorerUrl}/entity/${entityKey}`;
                console.log('🔍 Opening explorer for entity:', entityKey);
                window.open(explorerUrl, '_blank');
            };

            window.deleteDiagram = async function(diagramId, title) {
                const confirmed = await showConfirm('🗑️ Delete Diagram', `Are you sure you want to delete "${title}"?\n\nThis action cannot be undone.`);
                if (!confirmed) return;

                try {
                    console.log('🗑️ Deleting diagram:', diagramId);

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    // Add appropriate authentication header
                    if (walletConnected && walletAddress) {
                        headers['X-Wallet-Address'] = walletAddress;
                    } else if (custodialId) {
                        headers['X-Custodial-Id'] = custodialId;
                    }

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/${diagramId}`, {
                        method: 'DELETE',
                        headers
                    });

                    const result = await response.json();

                    if (result.success) {
                        await showAlert('✅ Deleted', `"${title}" has been marked for deletion!`);
                        // Refresh diagram list without closing modal
                        await refreshDiagramList();
                    } else if (result.requiresFrontendTransaction) {
                        await showAlert('⚠️ MetaMask Required', result.message);
                        // Could implement frontend delete transaction here
                    } else {
                        throw new Error(result.error || 'Delete failed');
                    }
                } catch (error) {
                    console.error('Failed to delete diagram:', error);
                    await showAlert('❌ Delete Failed', `Failed to delete: ${error.message}`);
                }
            };

            window.protectDiagram = async function(diagramId, title) {
                const confirmed = await showConfirm('🛡️ Protect Diagram', `Protect "${title}" by encoding its content?\n\nThis will add protection and encoding to the diagram.`);
                if (!confirmed) return;

                try {
                    console.log('🛡️ Protecting diagram:', diagramId);

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    // Add appropriate authentication header
                    if (walletConnected && walletAddress) {
                        headers['X-Wallet-Address'] = walletAddress;
                    } else if (custodialId) {
                        headers['X-Custodial-Id'] = custodialId;
                    }

                    const response = await fetch(`${BACKEND_URL}/api/diagrams/${diagramId}/protect`, {
                        method: 'PUT',
                        headers
                    });

                    const result = await response.json();

                    if (result.success) {
                        await showAlert('✅ Protected', `"${title}" has been protected successfully!`);
                        // Refresh diagram list without closing modal
                        await refreshDiagramList();
                    } else if (result.requiresFrontendTransaction) {
                        await showAlert('⚠️ MetaMask Required', result.message);
                        // Could implement frontend protect transaction here
                    } else {
                        throw new Error(result.error || 'Protect failed');
                    }
                } catch (error) {
                    console.error('Failed to protect diagram:', error);
                    await showAlert('❌ Protect Failed', `Failed to protect: ${error.message}`);
                }
            };

            window.shareDiagram = async function(diagramId, title) {
                try {
                    // Create shareable link
                    const shareUrl = `${window.location.origin}/?load=${diagramId}`;

                    // Try to copy to clipboard
                    if (navigator.clipboard) {
                        await navigator.clipboard.writeText(shareUrl);
                        await showAlert('📤 Share Link Copied', `Link for "${title}" has been copied to clipboard!\n\n${shareUrl}`);
                    } else {
                        // Fallback - show link in modal
                        await showAlert('📤 Share Link', `Copy this link to share "${title}":\n\n${shareUrl}`);
                    }
                } catch (error) {
                    console.error('Failed to share diagram:', error);
                    await showAlert('❌ Share Failed', `Failed to create share link: ${error.message}`);
                }
            };

            // Show detailed wallet info modal
            function showWalletInfoModal() {
                if (!walletConnected) {
                    connectWallet();
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
                    max-width: 400px;
                    width: 90%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                `;

                dialog.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        <h3 style="margin: 0; display: flex; align-items: center;">
                            🦊 MetaMask Wallet
                        </h3>
                        <button id="closeWalletInfo" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">✖</button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: bold; margin-bottom: 5px; color: #333;">📱 Address:</div>
                        <div style="font-family: monospace; font-size: 12px; background: #f8f9fa; padding: 8px; border-radius: 4px; word-break: break-all; border: 1px solid #dee2e6;">
                            ${walletAddress}
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: bold; margin-bottom: 5px; color: #333;">🌐 Network:</div>
                        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6;">
                            <div style="font-size: 14px;">${GOLEM_CONFIG.name}</div>
                            <div style="font-size: 11px; color: #666;">Chain ID: ${GOLEM_CONFIG.chainId}</div>
                            <div style="font-size: 11px; color: #666;">RPC: ${GOLEM_CONFIG.rpcUrl}</div>
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 5px; color: #333;">💰 Account Status:</div>
                        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6;">
                            <div style="font-size: 14px;">Balance: ${ethBalance.toFixed(8)} TGOLEM</div>
                            <div style="font-size: 11px; color: #666;">Connection: Active</div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="disconnectWallet" style="padding: 8px 16px; border: 1px solid #dc3545; background: white; color: #dc3545; border-radius: 4px; cursor: pointer;">Disconnect</button>
                        <button id="closeWalletModal" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Close</button>
                    </div>
                `;

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // Event handlers
                document.getElementById('closeWalletInfo').onclick = () => safeRemoveElement(overlay);
                document.getElementById('closeWalletModal').onclick = () => safeRemoveElement(overlay);
                document.getElementById('disconnectWallet').onclick = async () => {
                    safeRemoveElement(overlay);
                    await disconnectWallet();
                };

                // Click outside to close
                overlay.onclick = (e) => {
                    if (e.target === overlay) safeRemoveElement(overlay);
                };
            }

            // Add actions first
            ui.actions.addAction('golemdb-wallet', async function() {
                if (walletConnected) {
                    showWalletInfoModal();
                } else {
                    connectWallet();
                }
            }, null, null, walletConnected ? '🔐 MetaMask Wallet (Connected)' : '🔒 Connect MetaMask Wallet');

            ui.actions.addAction('golemdb-save', function() {
                saveToGolemDB();
            }, null, null, '💾 Save to Golem DB');

            ui.actions.addAction('golemdb-load', function() {
                showLoadDialog();
            }, null, null, '📂 Open from Golem DB');

            ui.actions.addAction('golemdb-manager', function() {
                openWebManager();
            }, null, null, '🌐 Golem DB Manager');

            ui.actions.addAction('golemdb-share', function() {
                showShareDialog();
            }, null, null, '🔗 Share Diagram');


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
                    const accounts = await safeMetaMaskRequest({ method: 'eth_accounts' });
                    if (accounts.length === 0) {
                        // Request connection
                        const connectResult = await showConfirm('🔗 Connect MetaMask', 'To configure Golem Network, we need to connect to your MetaMask wallet.\n\nConnect now?');
                        if (!connectResult) return;

                        await safeMetaMaskRequest({ method: 'eth_requestAccounts' });
                    }

                    // Get current network
                    const chainId = await safeMetaMaskRequest({ method: 'eth_chainId' });
                    const currentChainId = parseInt(chainId, 16);

                    const networkInfo = `Current Network: ${currentChainId === GOLEM_CONFIG.chainId ? `✅ ${GOLEM_CONFIG.name}` : `❌ Chain ${currentChainId} (Wrong Network)`}\n\nTarget Network: ${GOLEM_CONFIG.name} (${GOLEM_CONFIG.chainId})`;

                    if (currentChainId !== GOLEM_CONFIG.chainId) {
                        const switchResult = await showConfirm('🚀 Switch to Golem Network', `${networkInfo}\n\nSwitch to ${GOLEM_CONFIG.name} now?`);
                        if (!switchResult) return;

                        try {
                            // Try to switch to the network
                            await safeMetaMaskRequest({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: '0x' + GOLEM_CONFIG.chainId.toString(16) }],
                            });
                        } catch (switchError) {
                            // Network doesn't exist, add it
                            if (switchError.code === 4902) {
                                await safeMetaMaskRequest({
                                    method: 'wallet_addEthereumChain',
                                    params: [{
                                        chainId: '0x' + GOLEM_CONFIG.chainId.toString(16),
                                        chainName: GOLEM_CONFIG.name,
                                        nativeCurrency: {
                                            name: 'GLM',
                                            symbol: 'GLM',
                                            decimals: 18
                                        },
                                        rpcUrls: [GOLEM_CONFIG.rpcUrl],
                                        blockExplorerUrls: [GOLEM_CONFIG.explorerUrl]
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
                        await showAlert('✅ Setup Complete', 'Golem Network is configured and ready!\n\n🌟 You can now save diagrams directly to Golem DB\n💰 You will pay gas fees for transactions\n🔐 Your wallet controls your data');
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
                    console.log('🔍 Building File menu with Golem DB integration...');

                    // Override menu.addItem to intercept and inject our items
                    const originalAddItem = menu.addItem;
                    let saveGroupFound = false;
                    let openGroupFound = false;

                    menu.addItem = function(label, icon, action, parent, altText, elt, isEnabled) {
                        // Call original addItem first
                        const result = originalAddItem.call(this, label, icon, action, parent, altText, elt, isEnabled);

                        // Inject Save to Golem DB after standard save options
                        if (!saveGroupFound && (
                            label?.includes('Save') ||
                            label?.includes('Export') ||
                            (typeof label === 'string' && (label.includes('save') || label.includes('export')))
                        )) {
                            // Add our save option after the first save-related item
                            originalAddItem.call(this, '💾 Save to Golem DB', null, function() {
                                ui.actions.get('golemdb-save').funct();
                            }, parent);
                            saveGroupFound = true;
                        }

                        // Inject Open from Golem DB after standard open options
                        if (!openGroupFound && (
                            label?.includes('Open') ||
                            label?.includes('Import') ||
                            (typeof label === 'string' && (label.includes('open') || label.includes('import')))
                        )) {
                            // Add our open option after the first open-related item
                            originalAddItem.call(this, '📂 Open from Golem DB', null, function() {
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
                        menu.addItem('💾 Save to Golem DB', null, function() {
                            ui.actions.get('golemdb-save').funct();
                        }, parent);
                    }

                    // Add load item if not already injected
                    if (!openGroupFound) {
                        menu.addItem('📂 Open from Golem DB', null, function() {
                            ui.actions.get('golemdb-load').funct();
                        }, parent);
                    }


                    console.log('✅ Golem DB menu items integrated successfully!');
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

                    // Add Golem DB options to popup menu
                    menu.addItem('💾 Save to Golem DB', null, function() {
                        ui.actions.get('golemdb-save').funct();
                    });

                    menu.addItem('📂 Open from Golem DB', null, function() {
                        ui.actions.get('golemdb-load').funct();
                    });

                    menu.addItem('🔗 Share Diagram', null, function() {
                        ui.actions.get('golemdb-share').funct();
                    });

                    console.log('✅ Golem DB popup menu items added!');
                };
            }

            // Update wallet status displays
            function updateWalletStatusDisplays() {
                const statusDisplay = walletConnected ?
                    (shouldShowAccountInfo() ? `Connected (${walletAddress})` : 'Connected (address hidden)') :
                    'Disconnected';
                console.log(`💳 Wallet status: ${statusDisplay}`);

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
                        const accounts = await safeMetaMaskRequest({ method: 'eth_accounts' });
                        if (accounts.length > 0) {
                            console.log('🔄 Auto-connecting to previously authorized wallet...');
                            walletAddress = accounts[0];
                            walletConnected = true;
                            console.log('✅ Auto-connected to wallet:', walletAddress);

                            // Setup wallet change detection
                            setupWalletChangeDetection();

                            // Update wallet status displays
                            updateWalletStatusDisplays();

                            // Initialize SDK if in SDK mode
                            if (isSDKMode) {
                                try {
                                    await initializeGolemSDK();
                                    console.log('✅ Golem SDK initialized after auto-connect');
                                } catch (sdkError) {
                                    console.warn('⚠️ Failed to initialize SDK after auto-connect:', sdkError);
                                }
                            }

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
                            const accounts = await safeMetaMaskRequest({ method: 'eth_accounts' });
                            if (accounts.length > 0) {
                                const address = accounts[0];
                                connectionEl.innerHTML = `✅ Connected<br><span style="font-family: monospace; font-size: 10px;">${address.substring(0, 6)}...${address.substring(38)}</span>`;

                                // Network status
                                try {
                                    const chainId = await safeMetaMaskRequest({ method: 'eth_chainId' });
                                    const chainIdDecimal = parseInt(chainId, 16);
                                    const isGolemNetwork = chainIdDecimal === GOLEM_CONFIG.chainId;
                                    networkEl.innerHTML = `Network: ${isGolemNetwork ? '✅' : '❌'} ${isGolemNetwork ? GOLEM_CONFIG.name : `Chain ${chainIdDecimal}`}`;

                                    // Balance status
                                    try {
                                        const balance = await safeMetaMaskRequest({
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

            console.log('🎉 Built-in Golem DB Plugin loaded successfully!');

            // Create MetaMask status widget (hidden)
            // createMetaMaskStatusWidget();

            // Display plugin version and features
            console.log('');
            console.log('🚀 ========================================');
            console.log('🌟    GOLEM DB PLUGIN FOR DRAW.IO       ');
            console.log('🚀 ========================================');
            console.log(`📦 Version: ${PLUGIN_VERSION}`);
            console.log(`🔗 Backend: ${BACKEND_URL}`);
            console.log(`💳 Auto-connect: ${typeof window.ethereum !== 'undefined' ? 'Enabled' : 'Disabled (no MetaMask)'}`);
            console.log(`🎯 Mode: ${isSDKMode ? `SDK (Direct posting on ${GOLEM_CONFIG.name})` : 'Backend (Relay)'}`);
            console.log('');
            console.log('✨ Features:');
            console.log(`   • 🚀 Direct posting via MetaMask (SDK mode with Chain ${GOLEM_CONFIG.chainId})`);
            console.log('   • 🔄 Backend relay posting');
            console.log('   • 🔐 Automatic wallet reconnection');
            console.log('   • 🎨 Beautiful modal dialogs');
            console.log('   • 📊 Wallet status display');
            console.log('   • 📱 Right-click menu integration');
            console.log('');
            console.log('📍 Right-click on diagram to access Golem DB options');
            console.log('🚀 ========================================');

            // Auto-connect disabled - user will be prompted on first save attempt

            // Check backend private key status
            setTimeout(async () => {
                await checkBackendPrivateKey();
            }, 2000);

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
                        <h2 style="margin: 0 0 15px 0; font-size: 28px; font-weight: 600;">Golem DB Plugin Ready!</h2>
                        <p style="margin: 0 0 25px 0; font-size: 16px; opacity: 0.9; line-height: 1.5;">
                            Your Draw.io now has powerful Golem DB integration with MetaMask authentication.
                        </p>

                        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: left;">
                            <div style="font-weight: 600; margin-bottom: 12px; text-align: center;">✨ New Features Available</div>
                            <div style="font-size: 14px; line-height: 1.6;">
                                • 🔐 <strong>MetaMask Wallet</strong> - Secure authentication<br>
                                • 💾 <strong>Save to Golem DB</strong> - Decentralized storage<br>
                                • 📂 <strong>Load from Golem DB</strong> - Access your diagrams<br>
                                • ⚙️ <strong>Configuration</strong> - Customize BTL & settings<br>
                                • 🌐 <strong>Golem DB Manager</strong> - Web interface
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
                        safeRemoveElement(overlay);
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
                    ? `${GOLEM_CONFIG.explorerUrl}/entity/${diagram.entityKey}?tab=data`
                    : '';
                const shareText = `📊 Check out my diagram: "${diagram.title}"\n\n🔗 Open in Draw.io:\n${shareUrl}${explorerUrl ? `\n\n🔍 View on ${GOLEM_CONFIG.name} Explorer:\n${explorerUrl}` : ''}\n\n🌐 Powered by Golem Network`;

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

                    <button onclick="safeRemoveElement(document.querySelector('.share-modal-overlay'))" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-top: 20px; font-size: 14px;">Close</button>
                `;

                overlay.appendChild(modal);
                overlay.className = 'share-modal-overlay';
                overlay.style.zIndex = '10001'; // Higher than load modal
                document.body.appendChild(overlay);

                // Close on background click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        safeRemoveElement(overlay);
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
                    safeRemoveElement(textArea);
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
                                safeRemoveElement(toast);
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
                footer.innerHTML = `<button onclick="safeRemoveElement(this.closest('.auto-load-modal'))" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">OK</button>`;

                modal.appendChild(header);
                modal.appendChild(content);
                modal.appendChild(footer);

                overlay.appendChild(modal);
                overlay.className = 'auto-load-modal';
                document.body.appendChild(overlay);

                // Auto-close after timeout
                setTimeout(() => {
                    if (document.body.contains(overlay)) {
                        safeRemoveElement(overlay);
                    }
                }, timeout);

                // Close on background click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        safeRemoveElement(overlay);
                    }
                });
            }

            // Add Golem DB menu to menubar next to Help
            setTimeout(() => {
                try {
                    // Create Golem DB menu
                    ui.menus.put('golemdb', new Menu(function(menu, parent) {
                        menu.addItem('🌐 File Manager', null, function() {
                            openWebManager();
                        }, parent);

                        menu.addItem('⚙️ Configuration', null, function() {
                            showConfigDialog();
                        }, parent);

                        menu.addItem('🔐 MetaMask Wallet', null, function() {
                            if (walletConnected) {
                                showWalletInfoModal();
                            } else {
                                connectWallet();
                            }
                        }, parent);

                        menu.addSeparator(parent);

                        menu.addItem('💾 Save to Golem DB', null, function() {
                            saveToGolemDB();
                        }, parent);

                        menu.addItem('📂 Open from Golem DB', null, function() {
                            showLoadDialog();
                        }, parent);

                        menu.addItem('🔗 Share Diagram', null, function() {
                            showShareDialog();
                        }, parent);

                    }));

                    // Add menu item to menubar
                    const menubar = document.querySelector('.geMenubar, .geDiagramContainer .geMenubar, .mxWindow .geMenubar')
                                 || document.querySelector('[role="menubar"]')
                                 || document.querySelector('.geEditor .geMenubar');

                    if (menubar) {
                        // Find Help menu or last menu item
                        const helpMenu = Array.from(menubar.children).find(child =>
                            child.textContent && (child.textContent.includes('Help') || child.textContent.includes('?'))
                        );

                        // Create Golem DB menu button
                        const golemMenuItem = document.createElement('div');
                        golemMenuItem.className = 'geMenuItem';
                        golemMenuItem.style.cssText = `
                            display: inline-block;
                            padding: 4px 8px;
                            cursor: pointer;
                            border-radius: 3px;
                            margin: 0 2px;
                            transition: background 0.2s;
                            font-family: inherit;
                            font-size: inherit;
                            color: inherit;
                        `;
                        golemMenuItem.textContent = 'Golem DB';

                        // Add hover effects
                        golemMenuItem.onmouseenter = () => {
                            golemMenuItem.style.background = 'rgba(0,0,0,0.1)';
                        };
                        golemMenuItem.onmouseleave = () => {
                            golemMenuItem.style.background = 'transparent';
                        };

                        // Add click handler to show menu
                        golemMenuItem.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Create dropdown menu
                            const golemMenu = ui.menus.get('golemdb');
                            if (golemMenu && golemMenu.funct) {
                                const menuDiv = document.createElement('div');
                                menuDiv.className = 'geMenubarMenu';
                                menuDiv.style.cssText = `
                                    position: absolute;
                                    background: white;
                                    border: 1px solid #ccc;
                                    border-radius: 4px;
                                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                                    z-index: 10000;
                                    min-width: 180px;
                                    padding: 4px 0;
                                `;

                                // Position menu below button
                                const rect = golemMenuItem.getBoundingClientRect();
                                menuDiv.style.left = rect.left + 'px';
                                menuDiv.style.top = (rect.bottom + 2) + 'px';

                                // Create menu object
                                const menuObj = {
                                    items: [],
                                    addItem: function(label, icon, action, parent, altText, elt, isEnabled) {
                                        const item = document.createElement('div');
                                        item.style.cssText = `
                                            padding: 8px 16px;
                                            cursor: pointer;
                                            font-size: 13px;
                                            transition: background 0.2s;
                                            white-space: nowrap;
                                        `;
                                        item.textContent = label;

                                        if (action) {
                                            item.onclick = () => {
                                                safeRemoveElement(menuDiv);
                                                action();
                                            };
                                        }

                                        item.onmouseenter = () => {
                                            item.style.background = '#f0f0f0';
                                        };
                                        item.onmouseleave = () => {
                                            item.style.background = 'transparent';
                                        };

                                        menuDiv.appendChild(item);
                                        this.items.push(item);
                                    },
                                    addSeparator: function(parent) {
                                        const separator = document.createElement('div');
                                        separator.style.cssText = `
                                            height: 1px;
                                            background: #e0e0e0;
                                            margin: 4px 8px;
                                        `;
                                        menuDiv.appendChild(separator);
                                    }
                                };

                                // Build menu
                                golemMenu.funct(menuObj, null);

                                // Add to document
                                document.body.appendChild(menuDiv);

                                // Close on click outside
                                const closeMenu = (e) => {
                                    if (!menuDiv.contains(e.target) && !golemMenuItem.contains(e.target)) {
                                        safeRemoveElement(menuDiv);
                                        document.removeEventListener('click', closeMenu);
                                    }
                                };
                                setTimeout(() => document.addEventListener('click', closeMenu), 100);
                            }
                        };

                        // Insert before Help menu or at the end
                        if (helpMenu) {
                            menubar.insertBefore(golemMenuItem, helpMenu);
                        } else {
                            menubar.appendChild(golemMenuItem);
                        }

                        console.log('📂 Golem DB menu added to menubar');
                    } else {
                        console.log('⚠️ Could not find menubar to add Golem DB menu');
                    }
                } catch (error) {
                    console.error('❌ Error adding Golem DB menu:', error);
                }
            }, 2000); // Wait for UI to fully load

            // Add MetaMask icon to toolbar next to table icon
            setTimeout(() => {
                try {
                    // Find the toolbar container
                    const toolbar = document.querySelector('.geToolbar') || document.querySelector('[title*="table"], [title*="Table"]')?.closest('.geToolbar');

                    if (toolbar) {
                        // Create separator
                        const separator = document.createElement('div');
                        separator.style.cssText = `
                            width: 1px;
                            height: 20px;
                            background: #ddd;
                            margin: 0 4px;
                            display: inline-block;
                            vertical-align: middle;
                        `;

                        // Create MetaMask button
                        const metamaskBtn = document.createElement('button');
                        const addressDisplay = shouldShowAccountInfo() && walletConnected ?
                            ` (${walletAddress.substring(0,6)}...${walletAddress.substring(38)})` : '';
                        metamaskBtn.title = walletConnected ? `MetaMask Connected${addressDisplay}` : 'Connect MetaMask Wallet';
                        metamaskBtn.style.cssText = `
                            background: none;
                            border: none;
                            padding: 4px;
                            cursor: pointer;
                            display: inline-block;
                            vertical-align: middle;
                            border-radius: 3px;
                            transition: background 0.2s;
                        `;

                        // Add MetaMask emoji
                        metamaskBtn.innerHTML = `
                            <span style="font-size: 16px; opacity: ${walletConnected ? '1' : '0.6'}; filter: ${walletConnected ? 'none' : 'grayscale(100%)'};">🦊</span>
                        `;

                        // Add hover effects
                        metamaskBtn.onmouseenter = () => {
                            metamaskBtn.style.background = '#f0f0f0';
                        };
                        metamaskBtn.onmouseleave = () => {
                            metamaskBtn.style.background = 'none';
                        };

                        // Add click handler
                        metamaskBtn.onclick = () => {
                            if (walletConnected) {
                                showWalletInfoModal();
                            } else {
                                connectWallet();
                            }
                        };

                        // Try to find table button and add after it
                        const tableBtn = toolbar.querySelector('[title*="table"], [title*="Table"]') ||
                                         toolbar.querySelector('button') ||
                                         toolbar.querySelector('div');

                        if (tableBtn && tableBtn.parentNode) {
                            // Insert after table button
                            tableBtn.parentNode.insertBefore(separator, tableBtn.nextSibling);
                            tableBtn.parentNode.insertBefore(metamaskBtn, separator.nextSibling);
                        } else {
                            // Fallback: add to beginning of toolbar
                            toolbar.insertBefore(metamaskBtn, toolbar.firstChild);
                            toolbar.insertBefore(separator, metamaskBtn.nextSibling);
                        }

                        console.log('🦊 MetaMask toolbar button added');
                    } else {
                        console.log('⚠️ Could not find toolbar to add MetaMask button');
                    }
                } catch (error) {
                    console.error('❌ Error adding MetaMask toolbar button:', error);
                }
            }, 2000); // Wait for UI to fully load

            // Register Golem DB as a storage provider using DrawIO's native storage system
            if (typeof App !== 'undefined') {
                // Define Golem DB mode constant
                App.MODE_GOLEMDB = 'golemdb';

                // Add Golem DB to storage providers
                if (ui.editor && ui.editor.addStorageProvider) {
                    ui.editor.addStorageProvider('golemdb', {
                        displayName: '🔗 Golem DB',
                        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuNzMgOC4yOEwyMSA2TDE4Ljc3IDEwLjI3TDIyIDEyTDE4Ljc3IDEzLjczTDIxIDE4TDEzLjczIDE1LjcyTDEyIDIyTDEwLjI3IDE1LjcyTDMgMThMNS4yMyAxMy43M0wyIDEyTDUuMjMgMTAuMjdMMyA2TDEwLjI3IDguMjhMMTIgMloiIHN0cm9rZT0iIzE2YTM0YSIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSIjZjBmZGY0Ii8+Cjwvc3ZnPgo=',
                        save: saveToGolemDB,
                        load: showGolemDBLoadDialog
                    });
                    console.log('✅ Golem DB registered as storage provider');
                }
            }

            // Hook into Save and Open dialogs to add Golem DB option (fallback method)
            setTimeout(() => {
                try {
                    // Override the SaveDialog / StorageDialog to add Golem DB option
                    if (window.StorageDialog) {
                        const originalStorageDialog = window.StorageDialog;
                        window.StorageDialog = function(editorUi, fn, allowBrowser) {
                            const dialog = originalStorageDialog.call(this, editorUi, fn, allowBrowser);

                            // Find the storage options container and add Golem DB
                            setTimeout(() => {
                                const container = document.querySelector('.geDialog');
                                if (container) {
                                    // Look for existing storage buttons (Device, Google Drive, etc.)
                                    const buttons = container.querySelectorAll('button, div[style*="cursor"]');
                                    let storageContainer = null;

                                    for (let btn of buttons) {
                                        if (btn.textContent.includes('Device') ||
                                            btn.textContent.includes('Google') ||
                                            btn.textContent.includes('OneDrive') ||
                                            btn.querySelector('img')) {
                                            storageContainer = btn.parentNode;
                                            break;
                                        }
                                    }

                                    if (storageContainer) {
                                        // Create Golem DB storage option
                                        const golemBtn = document.createElement('div');
                                        golemBtn.style.cssText = `
                                            display: inline-block;
                                            margin: 10px;
                                            padding: 20px;
                                            border: 2px solid #16a34a;
                                            border-radius: 8px;
                                            cursor: pointer;
                                            text-align: center;
                                            background: #f0fdf4;
                                            min-width: 120px;
                                            transition: all 0.2s;
                                        `;

                                        golemBtn.innerHTML = `
                                            <div style="font-size: 24px; margin-bottom: 8px;">🔗</div>
                                            <div style="font-size: 12px; font-weight: bold; color: #16a34a;">Golem DB</div>
                                        `;

                                        golemBtn.onmouseenter = () => {
                                            golemBtn.style.background = '#dcfce7';
                                            golemBtn.style.borderColor = '#15803d';
                                        };

                                        golemBtn.onmouseleave = () => {
                                            golemBtn.style.background = '#f0fdf4';
                                            golemBtn.style.borderColor = '#16a34a';
                                        };

                                        golemBtn.onclick = () => {
                                            // Close the storage dialog
                                            const closeBtn = container.querySelector('button[title*="Close"], button[title*="Cancel"]');
                                            if (closeBtn) closeBtn.click();

                                            // Trigger Golem DB save
                                            setTimeout(() => {
                                                saveToGolemDB();
                                            }, 100);
                                        };

                                        storageContainer.appendChild(golemBtn);
                                        console.log('✅ Added Golem DB option to Storage dialog');
                                    }
                                }
                            }, 300);

                            return dialog;
                        };
                    }

                    // Fallback: Override ExportDialog for older DrawIO versions
                    if (window.ExportDialog && !window.StorageDialog) {
                        const originalExportDialog = window.ExportDialog;
                        window.ExportDialog = function(editorUi) {
                            const dialog = originalExportDialog.call(this, editorUi);

                            // Find the "Where" dropdown and add Golem DB option
                            setTimeout(() => {
                                const selects = document.querySelectorAll('select');
                                for (let select of selects) {
                                    // Look for the "Where" dropdown (usually contains Device, Cloud options)
                                    if (select.options.length > 0 && (
                                        Array.from(select.options).some(opt =>
                                            opt.text.includes('Device') ||
                                            opt.text.includes('Cloud') ||
                                            opt.text.includes('OneDrive') ||
                                            opt.text.includes('Google')
                                        )
                                    )) {
                                        // Add Golem DB option
                                        const golemOption = document.createElement('option');
                                        golemOption.value = 'golemdb';
                                        golemOption.text = '🔗 Golem DB';
                                        select.appendChild(golemOption);

                                        // Add event listener for when Golem DB is selected
                                        select.addEventListener('change', function() {
                                            if (this.value === 'golemdb') {
                                                // Trigger Golem DB save
                                                setTimeout(() => {
                                                    saveToGolemDB();
                                                    // Close the export dialog
                                                    const closeButtons = document.querySelectorAll('button');
                                                    for (let btn of closeButtons) {
                                                        if (btn.textContent.includes('Cancel') || btn.textContent.includes('Close')) {
                                                            btn.click();
                                                            break;
                                                        }
                                                    }
                                                }, 100);
                                            }
                                        });

                                        console.log('✅ Added Golem DB option to Save dialog');
                                        break;
                                    }
                                }
                            }, 500);

                            return dialog;
                        };
                    }

                    // Override the OpenDialog to add Golem DB option
                    if (window.OpenDialog) {
                        const originalOpenDialog = window.OpenDialog;
                        window.OpenDialog = function(editorUi) {
                            const dialog = originalOpenDialog.call(this, editorUi);

                            // Find the "From" dropdown and add Golem DB option
                            setTimeout(() => {
                                const selects = document.querySelectorAll('select');
                                for (let select of selects) {
                                    // Look for the "From" dropdown (usually contains Device, Cloud options)
                                    if (select.options.length > 0 && (
                                        Array.from(select.options).some(opt =>
                                            opt.text.includes('Device') ||
                                            opt.text.includes('Cloud') ||
                                            opt.text.includes('OneDrive') ||
                                            opt.text.includes('Google')
                                        )
                                    )) {
                                        // Add Golem DB option
                                        const golemOption = document.createElement('option');
                                        golemOption.value = 'golemdb';
                                        golemOption.text = '🔗 Golem DB';
                                        select.appendChild(golemOption);

                                        // Add event listener for when Golem DB is selected
                                        select.addEventListener('change', function() {
                                            if (this.value === 'golemdb') {
                                                // Trigger Golem DB open
                                                setTimeout(() => {
                                                    showLoadDialog();
                                                    // Close the open dialog
                                                    const closeButtons = document.querySelectorAll('button');
                                                    for (let btn of closeButtons) {
                                                        if (btn.textContent.includes('Cancel') || btn.textContent.includes('Close')) {
                                                            btn.click();
                                                            break;
                                                        }
                                                    }
                                                }, 100);
                                            }
                                        });

                                        console.log('✅ Added Golem DB option to Open dialog');
                                        break;
                                    }
                                }
                            }, 500);

                            return dialog;
                        };
                    }
                } catch (error) {
                    console.error('❌ Error hooking into Save/Open dialogs:', error);
                }
            }, 3000);

        });
    });

    // Export functions globally for external access - wait for DrawIO to be ready
    function exportGlobalFunctions() {
        window.saveToGolemDB = async function(title, encrypted = false) {
        const authenticated = await ensureAuthentication();
        if (!authenticated) {
            await showAlert('❌ Authentication Required', 'Please authenticate first.');
            return;
        }

        const xml = ui.editor.getGraphXml();
        let xmlString = mxUtils.getXml(xml);

        if (!title) {
            title = await showPrompt('💾 Save to Golem DB', 'Enter diagram title:', 'My Diagram');
            if (!title) return;
        }

        try {
            console.log('💾 Saving to Golem DB via global function...');
            await saveToGolemDBWithAuth(xmlString, null, title, encrypted);
        } catch (error) {
            console.error('Save failed:', error);
            await showAlert('❌ Save Failed', error.message);
        }
    };

    window.openWebManager = openWebManager;
    window.showGolemConfig = showConfigDialog;

        console.log('🌐 Global functions exported:', {
            saveToGolemDB: typeof window.saveToGolemDB,
            openWebManager: typeof window.openWebManager,
            showGolemConfig: typeof window.showGolemConfig
        });
    }

    // Export functions immediately and also set up deferred export
    exportGlobalFunctions();

    // Also set up a more robust waiting mechanism
    let exportAttempts = 0;
    const maxExportAttempts = 20;

    const ensureExport = setInterval(() => {
        exportAttempts++;

        // Check if all functions are properly exported
        const allExported = typeof window.saveToGolemDB === 'function' &&
                           typeof window.openWebManager === 'function' &&
                           typeof window.showGolemConfig === 'function';

        if (allExported) {
            console.log('✅ All global functions confirmed exported');
            clearInterval(ensureExport);
        } else if (exportAttempts >= maxExportAttempts) {
            console.log('⚠️ Max export attempts reached, forcing export');
            exportGlobalFunctions();
            clearInterval(ensureExport);
        } else {
            console.log(`🔄 Re-exporting functions (attempt ${exportAttempts}/${maxExportAttempts})`);
            exportGlobalFunctions();
        }
    }, 1000);

})();
