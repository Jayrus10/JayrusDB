<?php
// Configuración de la base de datos
$servidor = "sql5.freemysqlhosting.net";
$usuario = "sql5724016";
$contrasena = "EUFkMKIa7x";
$base_de_datos = "sql5724016";

// Crear conexión
$conn = new mysqli($servidor, $usuario, $contrasena, $base_de_datos);

// Verificar conexión
if ($conn->connect_error) {
    die("Conexión fallida: " . $conn->connect_error);
}

// Verificar si se ha proporcionado el ID
if (isset($_GET['idPrimaria'])) {
    $idPrimaria = intval($_GET['idPrimaria']); // Asegurarnos de que sea un número entero

    // Consulta SQL
    $sql = "SELECT * FROM aplicaciones WHERE idPrimaria = $idPrimaria";
    $result = $conn->query($sql);

    // Verificar si hay resultados
    if ($result->num_rows > 0) {
        // Obtener el resultado como un array asociativo
        $aplicacion = $result->fetch_assoc();
        
        // Devolver el resultado en formato JSON
        header('Content-Type: application/json');
        echo json_encode($aplicacion);
    } else {
        // Si no se encuentra la aplicación
        header('Content-Type: application/json');
        echo json_encode(["error" => "Aplicación no encontrada"]);
    }
} else {
    // Si no se proporciona el ID
    header('Content-Type: application/json');
    echo json_encode(["error" => "ID no proporcionado"]);
}

// Cerrar conexión
$conn->close();
?>
