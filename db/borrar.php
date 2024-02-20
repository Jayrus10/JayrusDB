<?php
// Obtener el nombre del archivo desde una variable o desde un formulario
$nombre_archivo = $_POST['archivo'];

// Definir la ruta de la carpeta upd
$ruta = __DIR__ . "/upd/";

// Comprobar si el archivo existe en la carpeta upd
if (file_exists ($ruta . $nombre_archivo)) {
  // Eliminar el archivo usando la función unlink ()
  unlink ($ruta . $nombre_archivo);

  // Mostrar un mensaje de éxito
  echo "El archivo $nombre_archivo se ha eliminado correctamente de la carpeta upd";
} else {
  // Mostrar un mensaje de error
  echo "El archivo $nombre_archivo no existe en la carpeta upd";
}
?>