// TGV Max Map - Integração com API SNCF (apenas dados reais)
class TGVMaxMap {
    constructor() {
        this.map = null;
        this.garesData = [];
        this.tgvMaxData = [];
        this.garesLayer = null;
        this.connectionsLayer = null;
        this.garesByName = new Map();
        this.connectionCounts = new Map();
        
        // URLs da API SNCF
        this.GARES_API = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/records';
        this.TGVMAX_API = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records';
    }

    async init() {
        this.showLoading(true);
        
        // Check cache
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `sncfData-${today}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                this.garesData = data.gares;
                this.tgvMaxData = data.tgvmax;
                this.buildGaresIndex();
                console.log('✅ Dados carregados do cache');
            } catch (e) {
                console.error('Erro ao analisar cache', e);
                localStorage.removeItem(cacheKey);
            }
        }
        
        try {
            // Inicializar mapa
            this.initMap();
            
            if (!this.garesData.length) {
                await this.loadGaresData();
            }
            
            if (!this.tgvMaxData.length) {
                await this.loadTGVMaxData();
            }
            
            // Salvar dados em cache
            if (!cachedData && this.garesData.length) {
                localStorage.setItem(cacheKey, JSON.stringify({
                    gares: this.garesData,
                    tgvmax: this.tgvMaxData
                }));
            }
            
            // Pré-computar contagens de conexão
            this.precomputeConnectionCounts();
            
            // Renderizar elementos
            this.renderGares();
            this.renderConnections();
            
            this.showSuccess(`Mapa carregado com ${this.garesData.length} gares e ${this.tgvMaxData.length} conexões TGV Max`);
            
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showError('Erro ao carregar dados da SNCF. Verifique sua conexão e tente novamente.');
        } finally {
            this.showLoading(false);
        }
    }

    buildGaresIndex() {
        this.garesByName.clear();
        this.garesData.forEach(gare => {
            if (gare.codeUic) {
                this.garesByName.set(gare.codeUic, gare);
            }
            // Indexar por nome normalizado também
            const normalized = this.normalizeGareName(gare.name);
            if (!this.garesByName.has(normalized)) {
                this.garesByName.set(normalized, gare);
            }
        });
    }

    initMap() {
        // Criar mapa centrado na França
        this.map = L.map('map', {
            renderer: L.canvas() // Usar renderizador Canvas para melhor performance
        }).setView([46.603354, 1.888334], 6);
        
        // Adicionar tile layer
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);
        
        // Criar grupos de layers
        this.garesLayer = L.layerGroup();
        this.connectionsLayer = L.layerGroup();
        
        // Adicionar controle de camadas
        const baseLayers = {
            "OpenStreetMap": osmLayer
        };
        
        const overlayMaps = {
            "Gares": this.garesLayer,
            "Conexões TGV Max": this.connectionsLayer
        };
        
        L.control.layers(baseLayers, overlayMaps).addTo(this.map);
        
        // Adicionar camadas ao mapa por padrão
        this.garesLayer.addTo(this.map);
        this.connectionsLayer.addTo(this.map);
    }

    async fetchWithRetry(url, options = {}, retries = 3) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        } catch (error) {
            if (retries > 0) {
                console.log(`Tentando novamente (${retries} restantes)...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.fetchWithRetry(url, options, retries - 1);
            }
            throw error;
        }
    }

    async loadGaresData() {
        try {
            console.log('Carregando dados das gares...');
            this.garesData = [];
            
            const maxPages = 5;
            
            for (let page = 0; page < maxPages; page++) {
                const offset = page * 100;
                const params = new URLSearchParams({
                    'limit': '100',
                    'offset': offset.toString(),
                    'select': 'nom,libellecourt,position_geographique,codeinsee,codes_uic,segment_drg',
                    'where': 'position_geographique IS NOT NULL'
                });
                
                const url = `${this.GARES_API}?${params}`;
                console.log(`Carregando página ${page + 1}...`);
                
                const data = await this.fetchWithRetry(url);
                
                if (!data.results || data.results.length === 0) {
                    console.log(`Página ${page + 1} vazia, parando paginação`);
                    break;
                }
                
                const pageData = data.results.map(record => {
                    const position = record.position_geographique;
                    if (!position || !position.lat || !position.lon) return null;
                    
                    return {
                        name: record.nom,
                        shortName: record.libellecourt,
                        lat: position.lat,
                        lon: position.lon,
                        codeUic: record.codes_uic,
                        codeInsee: record.codeinsee,
                        segment: record.segment_drg
                    };
                }).filter(Boolean);
                
                this.garesData = this.garesData.concat(pageData);
                
                if (data.results.length < 100) break;
            }
            
            console.log(`✅ Carregadas ${this.garesData.length} gares`);
            this.buildGaresIndex();
            
        } catch (error) {
            console.error('❌ Erro ao carregar gares:', error);
            throw error;
        }
    }

    async loadTGVMaxData() {
        try {
            console.log('Carregando dados TGV Max...');
            this.tgvMaxData = [];
            
            const today = new Date().toISOString().split('T')[0];
            const maxPages = 10;
            
            for (let page = 0; page < maxPages; page++) {
                const offset = page * 100;
                const params = new URLSearchParams({
                    'limit': '100',
                    'offset': offset.toString(),
                    'where': `date >= "${today}" and od_happy_card = "OUI"`,
                    'select': 'origine,destination,origine_iata,destination_iata,date,heure_depart,heure_arrivee,train_no,origine_uic,destination_uic'
                });
                
                const url = `${this.TGVMAX_API}?${params}`;
                console.log(`Carregando TGV Max página ${page + 1}...`);
                
                const data = await this.fetchWithRetry(url);
                
                if (!data.results || data.results.length === 0) {
                    console.log(`Página TGV Max ${page + 1} vazia, parando paginação`);
                    break;
                }
                
                const pageData = data.results.map(record => {
                    // Tentar encontrar UIC codes para melhor correspondência
                    const origineUic = record.origine_uic || 
                        this.findGareByName(record.origine)?.codeUic;
                    
                    const destinationUic = record.destination_uic || 
                        this.findGareByName(record.destination)?.codeUic;
                    
                    return {
                        origine: record.origine,
                        destination: record.destination,
                        origineCode: record.origine_iata,
                        destinationCode: record.destination_iata,
                        origineUic,
                        destinationUic,
                        date: record.date,
                        departure: record.heure_depart,
                        arrival: record.heure_arrivee,
                        trainNo: record.train_no
                    };
                }).filter(conn => conn.origine && conn.destination);
                
                this.tgvMaxData = this.tgvMaxData.concat(pageData);
                
                if (data.results.length < 100) break;
            }
            
            console.log(`✅ Carregadas ${this.tgvMaxData.length} conexões TGV Max`);
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados TGV Max:', error);
            this.tgvMaxData = [];
        }
    }

    precomputeConnectionCounts() {
        this.connectionCounts.clear();
        
        this.tgvMaxData.forEach(conn => {
            // Contar para origem
            if (conn.origineUic) {
                const count = this.connectionCounts.get(conn.origineUic) || 0;
                this.connectionCounts.set(conn.origineUic, count + 1);
            }
            
            // Contar para destino
            if (conn.destinationUic) {
                const count = this.connectionCounts.get(conn.destinationUic) || 0;
                this.connectionCounts.set(conn.destinationUic, count + 1);
            }
        });
    }

    renderGares() {
        // Limpar camada antes de renderizar
        this.garesLayer.clearLayers();
        
        if (!this.garesData.length) {
            console.warn('Nenhuma gare para renderizar');
            return;
        }
        
        console.log(`Renderizando ${this.garesData.length} gares...`);
        
        this.garesData.forEach(gare => {
            if (!gare.lat || !gare.lon) return;
            
            // Determinar tamanho do marcador baseado no segmento
            const baseRadius = gare.segment === 'A' ? 10 : gare.segment === 'B' ? 8 : 6;
            
            // Obter contagem de conexões
            const connectionCount = this.connectionCounts.get(gare.codeUic) || 0;
            const hasConnections = connectionCount > 0;
            
            // Ajustar tamanho e cor
            const radius = hasConnections ? baseRadius + 2 : baseRadius;
            const fillColor = hasConnections ? '#4a74f3' : '#e53e3e';
            
            // Criar marcador
            const marker = L.circleMarker([gare.lat, gare.lon], {
                radius,
                fillColor,
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            // Criar popup
            const popupContent = this.createGarePopup(gare, connectionCount);
            marker.bindPopup(popupContent);
            
            // Evento hover para estações com conexões
            if (hasConnections) {
                marker.on('mouseover', function(e) {
                    this.openPopup();
                });
            }
            
            this.garesLayer.addLayer(marker);
        });
        
        console.log(`✅ ${this.garesData.length} gares renderizadas`);
    }

    renderConnections() {
        // Limpar camada antes de renderizar
        this.connectionsLayer.clearLayers();
        
        if (!this.tgvMaxData.length) {
            console.warn('Nenhuma conexão TGV Max para renderizar');
            return;
        }
        
        console.log(`Renderizando conexões...`);
        
        const connectionPairs = new Map();
        
        this.tgvMaxData.forEach(connection => {
            // Encontrar gares por UIC code se disponível
            const origineGare = connection.origineUic ? 
                this.garesByName.get(connection.origineUic) : 
                this.findGareByName(connection.origine);
                
            const destGare = connection.destinationUic ? 
                this.garesByName.get(connection.destinationUic) : 
                this.findGareByName(connection.destination);
            
            if (!origineGare || !destGare) return;
            
            // Criar chave única para o par de conexão
            const key = [origineGare.codeUic, destGare.codeUic]
                .sort()
                .join('-');
            
            if (!connectionPairs.has(key)) {
                connectionPairs.set(key, {
                    from: origineGare,
                    to: destGare,
                    connections: []
                });
            }
            
            connectionPairs.get(key).connections.push(connection);
        });

        // Desenhar linhas
        connectionPairs.forEach(connectionData => {
            const {from, to, connections} = connectionData;
            const weight = Math.min(Math.log(connections.length) * 2 + 1, 8);
            
            const line = L.polyline([
                [from.lat, from.lon],
                [to.lat, to.lon]
            ], {
                color: '#4a74f3',
                weight,
                opacity: 0.7
            });

            const popupContent = this.createConnectionPopup(connectionData);
            line.bindPopup(popupContent);
            
            this.connectionsLayer.addLayer(line);
        });
        
        console.log(`✅ ${connectionPairs.size} conexões renderizadas`);
    }

    normalizeGareName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
            .replace(/\s+/g, ' ')
            .replace(/gare de |gare du |gare d'|gare des |gare /gi, '')
            .trim();
    }

    findGareByName(name) {
        if (!name) return null;
        
        // Tentar encontrar por nome normalizado
        const normalized = this.normalizeGareName(name);
        const gare = this.garesByName.get(normalized);
        
        if (gare) return gare;
        
        // Fallback: busca parcial
        for (const [key, value] of this.garesByName) {
            if (key.includes(normalized) || normalized.includes(key)) {
                return value;
            }
        }
        
        return null;
    }

    createGarePopup(gare, connectionCount) {
        return `
            <div class="popup-content">
                <h4>🚉 ${gare.name}</h4>
                <p><strong>Code court:</strong> ${gare.shortName || 'N/A'}</p>
                <p><strong>Segment:</strong> ${gare.segment || 'N/A'}</p>
                <p><strong>Code UIC:</strong> ${gare.codeUic || 'N/A'}</p>
                <p><strong>Coordenadas:</strong> ${gare.lat.toFixed(4)}, ${gare.lon.toFixed(4)}</p>
                
                ${connectionCount > 0 ? 
                    `<div class="popup-connections">
                        <strong>🚄 ${connectionCount} conexões TGV Max disponíveis</strong>
                        <p><em>Clique para ver rotas</em></p>
                    </div>` : 
                    '<p><em>Nenhuma conexão TGV Max encontrada</em></p>'}
            </div>
        `;
    }

    createConnectionPopup(connectionData) {
        const { from, to, connections } = connectionData;
        return `
            <div class="popup-content">
                <h4>🚄 ${from.name} ↔ ${to.name}</h4>
                <p><strong>${connections.length} viagens disponíveis</strong></p>
                
                <div class="popup-connections">
                    ${connections.slice(0, 5).map(conn => `
                        <div class="connection-item">
                            <span>Trem ${conn.trainNo || 'N/A'}</span>
                            <span>${conn.departure || ''} → ${conn.arrival || ''}</span>
                        </div>
                    `).join('')}
                    ${connections.length > 5 ? `<p><em>E mais ${connections.length - 5} viagens...</em></p>` : ''}
                </div>
            </div>
        `;
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('show', show);
            if (show) {
                loading.innerHTML = '<span>🔄 Carregando dados da SNCF...</span>';
            }
        }
    }

    showSuccess(message) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `<span style="color: #22543d;">✅ ${message}</span>`;
            loading.classList.add('show');
            
            setTimeout(() => {
                loading.classList.remove('show');
            }, 3000);
        }
    }

    showError(message) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `<span style="color: #e53e3e;">❌ ${message}</span>`;
            loading.classList.add('show');
        }
    }
}

// Inicializar mapa quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('map')) {
        console.log('🗺️ Inicializando TGV Max Map com dados reais da SNCF...');
        const tgvMap = new TGVMaxMap();
        tgvMap.init();
        
        // Adicionar botão de reset
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Recarregar Dados';
        resetBtn.style.position = 'absolute';
        resetBtn.style.top = '10px';
        resetBtn.style.right = '10px';
        resetBtn.style.zIndex = '1000';
        resetBtn.classList.add('reset-btn');
        document.body.appendChild(resetBtn);
        
        resetBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.reload();
        });
    }
});
