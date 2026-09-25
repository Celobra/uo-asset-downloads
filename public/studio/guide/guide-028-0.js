
const input=document.getElementById('search');const sections=[...document.querySelectorAll('.chapter')];const links=[...document.querySelectorAll('nav a')];
function filter(){const q=input.value.toLocaleLowerCase().trim();let n=0;sections.forEach((s,i)=>{const show=!q||s.textContent.toLocaleLowerCase().includes(q);s.hidden=!show;links[i].hidden=!show;if(show)n++;});document.getElementById('count').textContent=q?n+' of '+sections.length+' chapters match':sections.length+' chapters - available offline';document.getElementById('empty').hidden=n!==0;}
input.addEventListener('input',filter);document.getElementById('clear').addEventListener('click',()=>{input.value='';filter();input.focus()});links.forEach(a=>a.addEventListener('click',()=>{input.value='';filter()}));
document.getElementById('theme').addEventListener('click',()=>{const dark=document.body.classList.toggle('dark');document.getElementById('theme').setAttribute('aria-pressed',String(dark));});filter();
