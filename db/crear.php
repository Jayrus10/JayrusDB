<?php
// Obtener el texto que se quiere escribir desde una variable o desde un formulario
$texto = $_POST['texto'];

// Obtener el nombre del archivo desde una variable o desde un formulario
$nombre_archivo = $_POST['archivo'];

// Definir la ruta de la carpeta upd
$ruta = __DIR__ . "/upd/";

// Comprobar si la carpeta existe, y si no, crearla
if (!is_dir($ruta)) {
  mkdir($ruta);
}

// Abrir o crear el archivo con el nombre indicado en modo escritura dentro de la carpeta upd
$archivo = fopen($ruta . $nombre_archivo, "w") or die("No se pudo abrir o crear el archivo");

// Escribir el texto en el archivo
fwrite($archivo, $texto);

// Cerrar el archivo
fclose($archivo);

// Mostrar un mensaje de éxito
echo "El texto se ha escrito correctamente en el archivo $nombre_archivo dentro de la carpeta upd";
?>
