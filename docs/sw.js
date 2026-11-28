/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "42c9589dc5928ba4751e44d7114f5af7"
  }, {
    "url": "pwa-512x512.png",
    "revision": "57dcbf7c440964cb03148698abb22a84"
  }, {
    "url": "pwa-192x192.png",
    "revision": "731455a068c676edbca951c8b83abf7e"
  }, {
    "url": "index.html",
    "revision": "8a5318c809564dbc24236a190c0d74e0"
  }, {
    "url": "icon.svg",
    "revision": "493071dbc08b36d35bf61b2b935fdafe"
  }, {
    "url": "favicon.png",
    "revision": "65f198c02888508de85c4ca6b210d653"
  }, {
    "url": "favicon.ico",
    "revision": "469edf471c2f0ace28aa4af28fba8dea"
  }, {
    "url": "favicon-32x32.png",
    "revision": "3dfa9ffca3d56fcb59295f3ba34492de"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "350a09f095eb3aec0ab687e3f3379a2d"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/timer1-logo-COKHBv0V.png",
    "revision": null
  }, {
    "url": "assets/tendangan-white-Ba2-nvQG.png",
    "revision": null
  }, {
    "url": "assets/teguran2-D065_nCH.png",
    "revision": null
  }, {
    "url": "assets/teguran1-87Wv-cSm.png",
    "revision": null
  }, {
    "url": "assets/sekretaris1-logo-ttn7LCC4.png",
    "revision": null
  }, {
    "url": "assets/purify.es-Dqk5qvad.js",
    "revision": null
  }, {
    "url": "assets/pukulan-white-CpDgypvC.png",
    "revision": null
  }, {
    "url": "assets/peringatan2-MU9mUkXg.png",
    "revision": null
  }, {
    "url": "assets/peringatan1-LarM1etV.png",
    "revision": null
  }, {
    "url": "assets/monitor1-logo-DFG8ms_X.png",
    "revision": null
  }, {
    "url": "assets/juri1-logo-Dux4j4n-.png",
    "revision": null
  }, {
    "url": "assets/jrzscoreutama-Dq2ZcVFw.png",
    "revision": null
  }, {
    "url": "assets/jatuhanmerah-DzDYeISq.png",
    "revision": null
  }, {
    "url": "assets/index.es-JxhbZdP6.js",
    "revision": null
  }, {
    "url": "assets/index-DTU2pv73.js",
    "revision": null
  }, {
    "url": "assets/index-CfAypac5.css",
    "revision": null
  }, {
    "url": "assets/html2canvas-B-JZ18kf.js",
    "revision": null
  }, {
    "url": "assets/dewan1-logo-gbYK5HuT.png",
    "revision": null
  }, {
    "url": "assets/binaan2-CYp3pXrT.png",
    "revision": null
  }, {
    "url": "assets/binaan1-ByzGJ65B.png",
    "revision": null
  }, {
    "url": "assets/athlete_red_portrait_1795235456981-DAFkseqT.jpg",
    "revision": null
  }, {
    "url": "assets/athlete_red_female_1795235473044-B6GuAdUx.jpg",
    "revision": null
  }, {
    "url": "assets/athlete_blue_portrait_1795235456935-D7G7QYex.jpg",
    "revision": null
  }, {
    "url": "assets/athlete_blue_male_1795235472439-BPFAsiJX.jpg",
    "revision": null
  }, {
    "url": "assets/Jatuhanbiru-zUnP0tgg.png",
    "revision": null
  }, {
    "url": "assets/aistudio/log_nilai_aa4fb935.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_3f5e7f2f.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_1247e3e8.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "350a09f095eb3aec0ab687e3f3379a2d"
  }, {
    "url": "favicon-32x32.png",
    "revision": "3dfa9ffca3d56fcb59295f3ba34492de"
  }, {
    "url": "favicon.ico",
    "revision": "469edf471c2f0ace28aa4af28fba8dea"
  }, {
    "url": "favicon.png",
    "revision": "65f198c02888508de85c4ca6b210d653"
  }, {
    "url": "pwa-192x192.png",
    "revision": "731455a068c676edbca951c8b83abf7e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "57dcbf7c440964cb03148698abb22a84"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "42c9589dc5928ba4751e44d7114f5af7"
  }, {
    "url": "manifest.webmanifest",
    "revision": "dc58b7c4ab9cfb1b697b18a28f1cc404"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/__\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
