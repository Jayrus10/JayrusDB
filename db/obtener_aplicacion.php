<?php
// Verificar si se han proporcionado los datos de conexión
if (isset($_GET['servidor']) && isset($_GET['usuario']) && isset($_GET['contrasena']) && isset($_GET['base_de_datos']) && isset($_GET['idPrimaria'])) {
    // Obtener datos de conexión y ID desde la solicitud GET
    $servidor = $_GET['servidor'];
    $usuario = $_GET['usuario'];
    $contrasena = $_GET['contrasena'];
    $base_de_datos = $_GET['base_de_datos'];
    $idPrimaria = intval($_GET['idPrimaria']); // Asegurarnos de que sea un número entero

    // Crear conexión
    $conn = new mysqli($servidor, $usuario, $contrasena, $base_de_datos);

    // Verificar conexión
    if ($conn->connect_error) {
        die("Conexión fallida: " . $conn->connect_error);
    }

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

    // Cerrar conexión
    $conn->close();
} else {
    // Si faltan parámetros
    header('Content-Type: application/json');
    echo json_encode(["error" => "Faltan parámetros en la solicitud"]);
}
?>
