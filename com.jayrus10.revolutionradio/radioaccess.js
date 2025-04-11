// Función para obtener los datos del archivo JSON
async function obtenerDatosJSON() {
    try {
        const respuesta = await fetch('https://jayrus10.github.io/JayrusDB/com.jayrus10.revolutionradio/server_state.json'); // Reemplaza 'datos.json' con la ruta real a tu archivo JSON
        const datos = await respuesta.json();
        
        // Actualiza el enlace de descarga en la página
        document.getElementById('enlace-descarga').href = datos.url_descarga;
        
        // Muestra la versión disponible
        document.getElementById('version-numero').innerText = `Versi&oacute;n: ${datos.version_disponible}`;
        
    } catch (error) {
        console.error('Error al cargar el archivo JSON:', error);
    }
}

// Llama a la función al cargar la página
document.addEventListener('DOMContentLoaded', obtenerDatosJSON);
