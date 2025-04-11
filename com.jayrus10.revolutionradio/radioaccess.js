// Funci�n para obtener los datos del archivo JSON
async function obtenerDatosJSON() {
    try {
        const respuesta = await fetch('com.jayrus10.revolutionradio/server_state.json'); // Reemplaza 'datos.json' con la ruta real a tu archivo JSON
        const datos = await respuesta.json();
        
        // Actualiza el enlace de descarga en la p�gina
        document.getElementById('enlace-descarga').href = datos.url_descarga;
        
        // Muestra la versi�n disponible
        document.getElementById('version-numero').innerText = `Versi�n ${datos.version_disponible}`;
        
    } catch (error) {
        console.error('Error al cargar el archivo JSON:', error);
    }
}

// Llama a la funci�n al cargar la p�gina
document.addEventListener('DOMContentLoaded', obtenerDatosJSON);
