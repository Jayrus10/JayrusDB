<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Descarga de archivos ZIP</title>
    <style>
        body { font-family: Arial, sans-serif; }
        .zip-list { max-width: 400px; margin: 40px auto; }
        .zip-item { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #ddd; }
        .download-btn { padding: 5px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .download-btn:hover { background: #218838; }
    </style>
</head>
<body>
    <div class="zip-list">
        <h2>Archivos ZIP disponibles</h2>
        <?php
        // Obtener todos los archivos .zip del directorio actual
        $zipFiles = glob("*.zip");
        if (count($zipFiles) === 0) {
            echo "<p>No hay archivos ZIP en este directorio.</p>";
        } else {
            foreach ($zipFiles as $file) {
                echo '<div class="zip-item">';
                echo htmlspecialchars($file);
                echo ' <a href="' . urlencode($file) . '" download>
                        <button class="download-btn">Descargar</button>
                       </a>';
                echo '</div>';
            }
        }
        ?>
    </div>
</body>
</html>
