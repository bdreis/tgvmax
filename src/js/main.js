document.addEventListener('DOMContentLoaded', function() {
  console.log('TGV Max Explorer carregado!');
  
  // Destacar o link atual na navegação
  const currentPath = window.location.pathname;
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === currentPath || 
        (link.getAttribute('href') !== '/' && currentPath.startsWith(link.getAttribute('href')))) {
      link.style.fontWeight = 'bold';
      link.style.color = '#e74c3c';
    }
  });
});
