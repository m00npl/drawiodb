(function() {
  try {
	    var s = document.createElement('meta');
	    s.setAttribute('content', 'default-src \'self\'; script-src \'self\' https://storage.googleapis.com https://apis.google.com https://docs.google.com https://code.jquery.com https://cdnjs.cloudflare.com https://cdn.ethers.io https://unpkg.com https://cdn.jsdelivr.net \'unsafe-inline\'; script-src-attr \'unsafe-inline\'; connect-src \'self\' http://localhost:8899 https://api.drawiodb.online https://kaolin.holesky.golemdb.io wss://kaolin.holesky.golemdb.io https://ethwarsaw.holesky.golemdb.io wss://ethwarsaw.holesky.golemdb.io https://unpkg.com https://*.dropboxapi.com https://api.trello.com https://api.github.com https://raw.githubusercontent.com https://*.googleapis.com https://*.googleusercontent.com https://graph.microsoft.com https://*.1drv.com https://*.sharepoint.com https://gitlab.com https://*.google.com https://fonts.gstatic.com https://fonts.googleapis.com; img-src * data:; media-src * data:; font-src * about:; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; frame-src \'self\' https://*.google.com;');
	    s.setAttribute('http-equiv', 'Content-Security-Policy');
 	    var t = document.getElementsByTagName('meta')[0];
      t.parentNode.insertBefore(s, t);
  } catch (e) {} // ignore
})();
window.DRAWIO_SERVER_URL = '';
window.DRAWIO_BASE_URL = '';
window.DRAWIO_VIEWER_URL = '';
window.DRAWIO_LIGHTBOX_URL = '';
window.DRAW_MATH_URL = 'math/es5';
window.DRAWIO_CONFIG = null;
urlParams['sync'] = 'manual'; //Disable Real-Time
urlParams['db'] = '0'; //dropbox
urlParams['gh'] = '0'; //github
urlParams['tr'] = '0'; //trello
urlParams['gapi'] = '0'; //Google Drive
urlParams['od'] = '0'; //OneDrive
urlParams['gl'] = '0'; //Gitlab
urlParams['plugins'] = '/js/golem-db-plugin.js'; //Load Golem DB Plugin
