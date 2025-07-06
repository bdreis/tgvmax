// TGV Max Map - Com sistema de filtros avançado
class TGVMaxMap {
    constructor() {
        this.map = null;
        this.garesData = [];
        this.tgvMaxData = [];
        this.filteredTgvMaxData = [];
        this.garesLayer = null;
        this.connectionsLayer = null;
        this.uniqueGares = new Set();
        
        // Estados dos filtros
        this.filters = {
            origin: '',
            destination: '',
            date: ''
        };
        
        // URLs da API SNCF
        this.GARES_API = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/records';
        this.TGVMAX_API = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records';
    }

    async init() {
        this.showLoading(true);
        
        try {
            // Inicializar mapa
            this.initMap();
            
            // Carregar dados das gares (com paginação)
            await this.loadGaresData();
            
            // Carregar dados TGV Max
            await this.loadTGVMaxData();
            
            // Inicializar dados filtrados
            this.filteredTgvMaxData = [...this.tgvMaxData];
            
            // Construir opções de filtros
            this.buildFilterOptions();
            
            // Definir data padrão como hoje
            this.setDefaultDate();
            
            // Renderizar gares no mapa
            this.renderGares();
            
            // Renderizar conexões TGV Max
            this.renderConnections();
            
            // Atualizar estatísticas
            this.updateStats();
            
            this.showSuccess(`Mapa carregado com ${this.garesData.length} gares e ${this.tgvMaxData.length} conexões TGV Max`);
            
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showError('Erro ao carregar dados da SNCF. Verifique sua conexão e tente novamente.');
        } finally {
            this.showLoading(false);
        }
    }

    initMap() {
        // Criar mapa centrado na França
        this.map = L.map('map').setView([46.603354, 1.888334], 6);
        
        // Adicionar tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);
        
        // Criar grupos de layers
        this.garesLayer = L.layerGroup().addTo(this.map);
        this.connectionsLayer = L.layerGroup().addTo(this.map);
    }

    async loadGaresData() {
        try {
            console.log('Carregando dados das gares...');
            this.garesData = [];
            
            // Carregar múltiplas páginas para obter mais gares
            const maxPages = 5; // Máximo 5 páginas = 500 gares
            
            for (let page = 0; page < maxPages; page++) {
                const offset = page * 100;
                
                // Construir URL com parâmetros corretos
                const params = new URLSearchParams({
                    'limit': '100', // Máximo permitido pela API
                    'offset': offset.toString(),
                    'select': 'nom,libellecourt,position_geographique,codeinsee,codes_uic,segment_drg',
                    'where': 'position_geographique IS NOT NULL'
                });
                
                const url = `${this.GARES_API}?${params}`;
                console.log(`Carregando página ${page + 1}...`);
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (page === 0) {
                        throw new Error(`Erro ao carregar gares: HTTP ${response.status} - ${response.statusText}`);
                    } else {
                        console.warn(`Erro na página ${page + 1}, parando paginação`);
                        break;
                    }
                }
                
                const data = await response.json();
                
                if (!data.results || data.results.length === 0) {
                    console.log(`Página ${page + 1} vazia, parando paginação`);
                    break;
                }
                
                // Processar dados desta página
                const pageData = data.results.map(record => {
                    const position = record.position_geographique;
                    
                    if (!position || !position.lat || !position.lon) {
                        return null;
                    }
                    
                    return {
                        name: record.nom,
                        shortName: record.libellecourt,
                        lat: position.lat,
                        lon: position.lon,
                        codeUic: record.codes_uic,
                        codeInsee: record.codeinsee,
                        segment: record.segment_drg
                    };
                }).filter(gare => gare !== null);
                
                this.garesData = this.garesData.concat(pageData);
                console.log(`Página ${page + 1}: +${pageData.length} gares (total: ${this.garesData.length})`);
                
                // Se retornou menos que 100, chegamos ao fim
                if (data.results.length < 100) {
                    console.log('Todas as páginas carregadas');
                    break;
                }
            }
            
            console.log(`✅ Carregadas ${this.garesData.length} gares da SNCF`);
            
            if (this.garesData.length === 0) {
                throw new Error('Nenhuma gare encontrada na resposta da API');
            }
            
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
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);
            const future = futureDate.toISOString().split('T')[0];
            
            // Carregar múltiplas páginas de dados TGV Max para os próximos 30 dias
            const maxPages = 20; // Aumentar para pegar mais dados
            
            for (let page = 0; page < maxPages; page++) {
                const offset = page * 100;
                
                const params = new URLSearchParams({
                    'limit': '100',
                    'offset': offset.toString(),
                    'where': `date >= "${today}" and date <= "${future}" and od_happy_card = "OUI"`,
                    'select': 'origine,destination,origine_iata,destination_iata,date,heure_depart,heure_arrivee,train_no'
                });
                
                const url = `${this.TGVMAX_API}?${params}`;
                console.log(`Carregando TGV Max página ${page + 1}...`);
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (page === 0) {
                        console.warn(`Aviso: Não foi possível carregar dados TGV Max: HTTP ${response.status}`);
                        break;
                    } else {
                        console.warn(`Erro na página TGV Max ${page + 1}, parando paginação`);
                        break;
                    }
                }
                
                const data = await response.json();
                
                if (!data.results || data.results.length === 0) {
                    console.log(`Página TGV Max ${page + 1} vazia, parando paginação`);
                    break;
                }
                
                // Processar dados desta página
                const pageData = data.results.map(record => ({
                    origine: record.origine,
                    destination: record.destination,
                    origineCode: record.origine_iata,
                    destinationCode: record.destination_iata,
                    date: record.date,
                    departure: record.heure_depart,
                    arrival: record.heure_arrivee,
                    trainNo: record.train_no
                })).filter(conn => conn.origine && conn.destination);
                
                this.tgvMaxData = this.tgvMaxData.concat(pageData);
                console.log(`Página TGV Max ${page + 1}: +${pageData.length} conexões (total: ${this.tgvMaxData.length})`);
                
                // Se retornou menos que 100, chegamos ao fim
                if (data.results.length < 100) {
                    console.log('Todas as páginas TGV Max carregadas');
                    break;
                }
            }
            
            console.log(`✅ Carregadas ${this.tgvMaxData.length} conexões TGV Max`);
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados TGV Max:', error);
            // Não falhar se apenas os dados TGV Max falharem
            this.tgvMaxData = [];
        }
    }

    buildFilterOptions() {
        console.log('🎯 Construindo opções de filtros...');
        
        // Extrair origens e destinos únicos dos dados TGV Max
        const origins = new Set();
        const destinations = new Set();
        
        this.tgvMaxData.forEach(conn => {
            if (conn.origine) origins.add(conn.origine);
            if (conn.destination) destinations.add(conn.destination);
        });
        
        // Populrar dropdown de origens
        const originSelect = document.getElementById('filter-origin');
        Array.from(origins).sort().forEach(origin => {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            originSelect.appendChild(option);
        });
        
        // Populrar dropdown de destinos
        const destinationSelect = document.getElementById('filter-destination');
        Array.from(destinations).sort().forEach(destination => {
            const option = document.createElement('option');
            option.value = destination;
            option.textContent = destination;
            destinationSelect.appendChild(option);
        });
        
        console.log(`✅ Filtros construídos: ${origins.size} origens, ${destinations.size} destinos`);
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('filter-date');
        if (dateInput) {
            dateInput.value = today;
            this.filters.date = today;
        }
    }

    applyFilters() {
        console.log('🔍 Aplicando filtros...');
        
        // Ler valores dos filtros
        this.filters.origin = document.getElementById('filter-origin').value;
        this.filters.destination = document.getElementById('filter-destination').value;
        this.filters.date = document.getElementById('filter-date').value;
        
        // Aplicar filtros aos dados
        this.filteredTgvMaxData = this.tgvMaxData.filter(conn => {
            let matches = true;
            
            // Filtro de origem
            if (this.filters.origin && conn.origine !== this.filters.origin) {
                matches = false;
            }
            
            // Filtro de destino
            if (this.filters.destination && conn.destination !== this.filters.destination) {
                matches = false;
            }
            
            // Filtro de data
            if (this.filters.date && conn.date !== this.filters.date) {
                matches = false;
            }
            
            return matches;
        });
        
        console.log(`📊 Filtros aplicados: ${this.filteredTgvMaxData.length}/${this.tgvMaxData.length} conexões`);
        
        // Re-renderizar mapa
        this.renderGares();
        this.renderConnections();
        this.updateStats();
        
        // Mostrar feedback
        this.showFilterFeedback();
    }

    clearFilters() {
        console.log('🔄 Limpando filtros...');
        
        // Limpar campos de filtro
        document.getElementById('filter-origin').value = '';
        document.getElementById('filter-destination').value = '';
        document.getElementById('filter-date').value = '';
        
        // Resetar filtros
        this.filters = { origin: '', destination: '', date: '' };
        
        // Restaurar todos os dados
        this.filteredTgvMaxData = [...this.tgvMaxData];
        
        // Re-renderizar mapa
        this.renderGares();
        this.renderConnections();
        this.updateStats();
        
        // Definir data padrão
        this.setDefaultDate();
        
        this.showSuccess('Filtros limpos');
    }

    renderGares() {
        // Limpar layer anterior
        this.garesLayer.clearLayers();
        
        if (this.garesData.length === 0) {
            console.warn('Nenhuma gare para renderizar');
            return;
        }
        
        console.log(`🎨 Renderizando ${this.garesData.length} gares...`);
        
        this.garesData.forEach(gare => {
            if (gare.lat && gare.lon) {
                // Determinar tamanho do marcador baseado no segmento
                const radius = gare.segment === 'A' ? 10 : gare.segment === 'B' ? 8 : 6;
                
                // Contar conexões TGV Max para esta gare (usando dados filtrados)
                const connections = this.filteredTgvMaxData.filter(conn => 
                    this.normalizeGareName(conn.origine).includes(this.normalizeGareName(gare.name).split(' ')[0]) || 
                    this.normalizeGareName(conn.destination).includes(this.normalizeGareName(gare.name).split(' ')[0])
                );

                // Definir cor baseada em conexões TGV Max
                const hasConnections = connections.length > 0;
                const fillColor = hasConnections ? '#4a74f3' : '#e53e3e';
                const finalRadius = hasConnections ? radius + 2 : radius;
                
                // Criar marcador para cada gare
                const marker = L.circleMarker([gare.lat, gare.lon], {
                    radius: finalRadius,
                    fillColor: fillColor,
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                // Criar popup com informações
                const popupContent = this.createGarePopup(gare, connections);
                marker.bindPopup(popupContent);
                
                // Adicionar evento de hover para gares com conexões TGV Max
                if (hasConnections) {
                    marker.on('mouseover', function(e) {
                        this.openPopup();
                    });
                }
                
                // Adicionar ao layer
                this.garesLayer.addLayer(marker);
            }
        });
        
        console.log(`✅ Gares renderizadas`);
    }

    renderConnections() {
        // Limpar layer anterior
        this.connectionsLayer.clearLayers();
        
        if (this.filteredTgvMaxData.length === 0) {
            console.warn('Nenhuma conexão TGV Max para renderizar com os filtros atuais');
            return;
        }
        
        console.log(`🎨 Renderizando ${this.filteredTgvMaxData.length} conexões filtradas...`);
        
        const connectionPairs = new Map();
        
        this.filteredTgvMaxData.forEach(connection => {
            // Encontrar coordenadas das gares de origem e destino
            const origineGare = this.findGareByName(connection.origine);
            const destGare = this.findGareByName(connection.destination);
            
            if (origineGare && destGare) {
                const key = `${origineGare.name}-${destGare.name}`;
                const reverseKey = `${destGare.name}-${origineGare.name}`;
                
                if (!connectionPairs.has(key) && !connectionPairs.has(reverseKey)) {
                    connectionPairs.set(key, {
                        from: origineGare,
                        to: destGare,
                        connections: []
                    });
                }
                
                const existingConnection = connectionPairs.get(key) || connectionPairs.get(reverseKey);
                if (existingConnection) {
                    existingConnection.connections.push(connection);
                }
            }
        });

        // Desenhar linhas de conexão
        connectionPairs.forEach(connectionData => {
            const line = L.polyline([
                [connectionData.from.lat, connectionData.from.lon],
                [connectionData.to.lat, connectionData.to.lon]
            ], {
                color: '#4a74f3',
                weight: Math.min(connectionData.connections.length + 2, 8),
                opacity: 0.7
            });

            const popupContent = this.createConnectionPopup(connectionData);
            line.bindPopup(popupContent);
            
            this.connectionsLayer.addLayer(line);
        });
        
        console.log(`✅ ${connectionPairs.size} conexões renderizadas`);
    }

    updateStats() {
        const totalConnections = this.tgvMaxData.length;
        const filteredConnections = this.filteredTgvMaxData.length;
        const garesWithConnections = this.garesData.filter(gare => {
            return this.filteredTgvMaxData.some(conn => 
                conn.origine.toLowerCase().includes(gare.name.toLowerCase().split(' ')[0]) ||
                conn.destination.toLowerCase().includes(gare.name.toLowerCase().split(' ')[0])
            );
        }).length;
        
        const statsDiv = document.getElementById('filter-stats');
        if (statsDiv) {
            statsDiv.innerHTML = `
                <div><strong>📊 Estatísticas Atuais:</strong></div>
                <div>🚄 Conexões: ${filteredConnections}/${totalConnections}</div>
                <div>🚉 Gares ativas: ${garesWithConnections}/${this.garesData.length}</div>
                <div>📈 Taxa de filtro: ${((filteredConnections/totalConnections)*100).toFixed(1)}%</div>
            `;
        }
    }

    showFilterFeedback() {
        const count = this.filteredTgvMaxData.length;
        if (count === 0) {
            this.showError('❌ Nenhuma conexão encontrada com os filtros aplicados');
        } else {
            this.showSuccess(`✅ ${count} conexão(ões) encontrada(s)`);
        }
    }

    togglePanel() {
        document.body.classList.toggle('panel-hidden');
    }

    normalizeGareName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/gare de |gare du |gare d'|gare des /g, '')
            .trim();
    }

    findGareByName(name) {
        if (!name) return null;
        
        const normalizedSearch = this.normalizeGareName(name);
        
        return this.garesData.find(gare => {
            const normalizedGare = this.normalizeGareName(gare.name);
            const firstWord = normalizedSearch.split(' ')[0];
            
            // Busca por correspondência parcial
            return normalizedGare.includes(firstWord) || 
                   normalizedSearch.includes(normalizedGare.split(' ')[0]) ||
                   gare.shortName && gare.shortName.toLowerCase() === firstWord;
        });
    }

    createGarePopup(gare, connections) {
        const connectionCount = connections.length;
        
        return `
            <div class="popup-content">
                <h4>🚉 ${gare.name}</h4>
                <p><strong>Code court:</strong> ${gare.shortName || 'N/A'}</p>
                <p><strong>Segment:</strong> ${gare.segment || 'N/A'}</p>
                <p><strong>Code UIC:</strong> ${gare.codeUic || 'N/A'}</p>
                <p><strong>Coordenadas:</strong> ${gare.lat.toFixed(4)}, ${gare.lon.toFixed(4)}</p>
                
                ${connectionCount > 0 ? `
                    <div class="popup-connections">
                        <strong>🚄 ${connectionCount} conexões TGV Max (filtradas)</strong>
                        ${connections.slice(0, 3).map(conn => `
                            <div class="connection-item">
                                <span>${conn.destination || conn.origine}</span>
                                <span class="connection-status connection-available">${conn.date}</span>
                            </div>
                        `).join('')}
                        ${connectionCount > 3 ? `<p><em>E mais ${connectionCount - 3} conexões...</em></p>` : ''}
                    </div>
                ` : '<p><em>Nenhuma conexão TGV Max com os filtros atuais</em></p>'}
            </div>
        `;
    }

    createConnectionPopup(connectionData) {
        const { from, to, connections } = connectionData;
        
        return `
            <div class="popup-content">
                <h4>🚄 ${from.name} ↔ ${to.name}</h4>
                <p><strong>${connections.length} viagem(ns) TGV Max (filtrada)</strong></p>
                
                <div class="popup-connections">
                    ${connections.slice(0, 4).map(conn => `
                        <div class="connection-item">
                            <span>🚆 ${conn.trainNo || 'N/A'}</span>
                            <span>${conn.departure || ''} → ${conn.arrival || ''}</span>
                        </div>
                        <div style="font-size: 11px; color: #666;">📅 ${conn.date}</div>
                    `).join('')}
                    ${connections.length > 4 ? `<p><em>E mais ${connections.length - 4} viagem(ns)...</em></p>` : ''}
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
            
            // Remover mensagem de sucesso após 3 segundos
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
            
            // Remover mensagem de erro após 5 segundos
            setTimeout(() => {
                loading.classList.remove('show');
            }, 5000);
        }
    }
}

// Inicializar mapa quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('map')) {
        console.log('🗺️ Inicializando TGV Max Map com filtros...');
        window.tgvMap = new TGVMaxMap();
        window.tgvMap.init();
    }
});
