document.addEventListener('DOMContentLoaded', function() {
  console.log('TGV Max Explorer carregado!');

  // Destacar o link atual na navegação
  const currentPath = window.location.pathname;
  document.querySelectorAll('nav a').forEach(link => {
      // Remove a classe 'active' de todos os links
      link.classList.remove('active');

      if (link.getAttribute('href') === currentPath || 
          (link.getAttribute('href') !== '/' && currentPath.startsWith(link.getAttribute('href')))) {
          link.classList.add('active'); // Adiciona a classe apenas ao link atual
      }
  });
});

