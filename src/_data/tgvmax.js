// src/_data/tgvmax.js

// Cache pour stocker les données et éviter des requêtes répétées
let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 3600000; // 1 heure en millisecondes

module.exports = (async () => {
  // Si nous avons des données en cache qui sont encore valides, les utiliser
  if (cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    console.log("Utilisation des données en cache pour TGV Max");
    return cachedData;
  }

  const { default: fetch } = await import('node-fetch');
  
  try {
    // 1. Récupérer d'abord les données des gares pour avoir les coordonnées
    console.log("Récupération des données des gares SNCF...");
    const garesUrl = 'https://data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/records?limit=1000';
    const garesResponse = await fetch(garesUrl);
    const garesData = await garesResponse.json();
    
    // Créer un dictionnaire des gares avec leurs coordonnées
    const garesByName = {};
    garesData.records.forEach(record => {
      if (record.fields && record.fields.libelle && record.fields.wgs_84) {
        // Stocker les coordonnées par nom de gare
        const nom = record.fields.libelle.toLowerCase().trim();
        
        // Les coordonnées sont souvent au format [latitude, longitude]
        const coordinates = record.fields.wgs_84;
        
        garesByName[nom] = {
          name: record.fields.libelle,
          latitude: coordinates ? coordinates.lat || coordinates[0] : null,
          longitude: coordinates ? coordinates.lon || coordinates[1] : null,
          // Ajouter d'autres informations utiles des gares
          code_uic: record.fields.code_uic,
          departement: record.fields.departement,
          region: record.fields.region
        };
      }
    });
    
    console.log(`Nombre de gares récupérées: ${Object.keys(garesByName).length}`);
    
    // 2. Récupérer les données TGV Max
    console.log("Récupération des données TGV Max...");
    const tgvmaxUrl = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records';
    const tgvmaxResponse = await fetch(tgvmaxUrl);
    const tgvmaxData = await tgvmaxResponse.json();
    
    console.log(`Nombre de trajets TGV Max récupérés: ${tgvmaxData.records.length}`);

    // 3. Combiner les données
    const destinations = tgvmaxData.records
      .map(record => {
        if (!record || !record.fields) {
          return null;
        }
        
        const fields = record.fields;
        
        // Normaliser les noms de gares pour la recherche
        const destinationName = fields.destination ? fields.destination.toLowerCase().trim() : null;
        const originName = fields.origine ? fields.origine.toLowerCase().trim() : null;
        
        // Récupérer les informations de gare pour la destination et l'origine
        const destinationGare = destinationName ? garesByName[destinationName] : null;
        const originGare = originName ? garesByName[originName] : null;
        
        // Si nous n'avons pas trouvé la gare, utiliser les coordonnées de l'API TGV Max si disponibles
        const destinationLat = destinationGare ? destinationGare.latitude : (typeof fields.latitude === 'number' ? fields.latitude : null);
        const destinationLon = destinationGare ? destinationGare.longitude : (typeof fields.longitude === 'number' ? fields.longitude : null);
        
        // Vérifier que nous avons au moins les coordonnées de la destination
        if (destinationLat === null || destinationLon === null) {
          console.warn(`Coordonnées manquantes pour la destination: ${fields.destination}`);
          return null;
        }
        
        return {
          name: fields.destination,
          latitude: destinationLat,
          longitude: destinationLon,
          departureCity: fields.origine,
          arrivalTime: fields.heure_arrivee,
          departureTime: fields.heure_depart,
          // Ajouter des informations supplémentaires de la gare si disponibles
          departement: destinationGare ? destinationGare.departement : null,
          region: destinationGare ? destinationGare.region : null,
          // Informations sur la gare d'origine si disponibles
          originLatitude: originGare ? originGare.latitude : null,
          originLongitude: originGare ? originGare.longitude : null,
          originDepartement: originGare ? originGare.departement : null,
          originRegion: originGare ? originGare.region : null
        };
      })
      .filter(Boolean); // Filtrer les entrées nulles

    // Regrouper les destinations par nom pour éviter les doublons
    const uniqueDestinations = {};
    destinations.forEach(dest => {
      const key = `${dest.name}`;
      if (!uniqueDestinations[key] || !uniqueDestinations[key].departureCity) {
        uniqueDestinations[key] = dest;
      }
    });

    // Créer un tableau des destinations uniques
    const finalDestinations = Object.values(uniqueDestinations);
    
    console.log(`Nombre de destinations uniques: ${finalDestinations.length}`);

    // Mettre à jour le cache
    cachedData = { 
      destinations: finalDestinations,
      routes: destinations, // Conserver également tous les trajets
      lastUpdated: new Date().toISOString()
    };
    cacheTimestamp = Date.now();
    
    return cachedData;
  } catch (error) {
    console.error("Erreur lors de la récupération des données des API:", error);
    
    // En cas d'erreur, utiliser le cache même s'il est expiré
    if (cachedData) {
      console.log("Utilisation des données en cache expirées suite à une erreur");
      return cachedData;
    }
    
    return {
      destinations: [],
      routes: [],
      lastUpdated: new Date().toISOString()
    };
  }
})();
