// src/_data/tgvmax.js
const fetch = require('node-fetch');

module.exports = async function() {
    const url = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records?limit=100'; // Aumentei o limite para 100

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Simplificando e formatando os dados
    const destinations = data.records.map(record => {
            if (!record || !record.fields || typeof record.fields.latitude !== 'number' || typeof record.fields.longitude !== 'number'){
                return null; // Ignorando entradas inválidas
            }
        return {
        name: record.fields.destination,
        latitude: record.fields.latitude,
        longitude: record.fields.longitude,
        departureCity: record.fields.origine,
                arrivalTime: record.fields.heure_arrivee,
                departureTime: record.fields.heure_depart

      };
    }).filter(Boolean); // Filtra as entradas nulas


    return {
      destinations: destinations
    };
  } catch (error) {
    console.error("Erro ao buscar dados da API:", error);
    return {
      destinations: [] // Retorna um array vazio em caso de erro.
    };
  }
};
