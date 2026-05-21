export function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")||fallback}catch{return fallback}}
