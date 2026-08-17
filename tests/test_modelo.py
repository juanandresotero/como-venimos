import unittest

from robot import modelo

# Recorte real de la API (propiedad 31193, bajada el 2026-08-17).
LISTING = {
    "id": 31193,
    "entityId": "a355f1fe-efc5-4a5a-87a5-c6d33f82bd4f",
    "internalId": "940041154-217",
    "title": "Venta 2 casas en Maroñas con cochera y gran salón",
    "slug": "venta-2-casas-en-maronas-con-cochera-y-gran-salon",
    "operation": {"id": 1, "value": "sale"},
    "type": {"id": 9, "value": "casa"},
    "currency": {"id": 1, "value": "USD"},
    "expensesCurrency": {"id": 3, "value": "UYU"},
    "expensesPrice": None,
    "listingStatus": {"id": 1, "value": "active"},
    "price": 240000.0,
    "displayAddress": "Gobernador Vigodet 2700",
    "geoLabel": None,
    "location": {"type": "Point", "coordinates": [-56.1320319, -34.8604102]},
    "dimensionLand": 565,
    "dimensionTotalBuilt": 565,
    "dimensionCovered": 227,
    "bedrooms": 4,
    "bathrooms": 2,
    "totalRooms": 7,
    "photos": [{"rawValue": "listings/a355f1fe/03e41346"}],
}


class TestNormalizar(unittest.TestCase):
    def test_identidad_y_link(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["entity_id"], "a355f1fe-efc5-4a5a-87a5-c6d33f82bd4f")
        self.assertEqual(p["internal_id"], "940041154-217")
        self.assertEqual(p["listing_id"], 31193)
        self.assertEqual(
            p["link"],
            "https://www.remax.com.uy/listings/venta-2-casas-en-maronas-con-cochera-y-gran-salon",
        )

    def test_traduce_operacion_y_estado_al_castellano(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["operacion"], "venta")
        self.assertEqual(p["estado"], "publicada")

    def test_traduce_los_otros_estados(self):
        for api_dice, esperado in (
            ("negotiation", "en_negociacion"),
            ("reserved", "reservada"),
        ):
            crudo = dict(LISTING, listingStatus={"id": 9, "value": api_dice})
            self.assertEqual(modelo.normalizar(crudo)["estado"], esperado)

    def test_traduce_alquiler(self):
        crudo = dict(LISTING, operation={"id": 2, "value": "rent"})
        self.assertEqual(modelo.normalizar(crudo)["operacion"], "alquiler")

    def test_precio_moneda_y_medidas(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["precio"], 240000.0)
        self.assertEqual(p["moneda"], "USD")
        self.assertEqual(p["m2_terreno"], 565)
        self.assertEqual(p["m2_cubierto"], 227)
        self.assertEqual(p["dormitorios"], 4)
        self.assertEqual(p["banos"], 2)

    def test_coordenadas_vienen_al_reves(self):
        # La API usa GeoJSON: [longitud, latitud]. Nosotros guardamos lat y lon aparte.
        p = modelo.normalizar(LISTING)
        self.assertAlmostEqual(p["lat"], -34.8604102)
        self.assertAlmostEqual(p["lon"], -56.1320319)

    def test_barrio_sale_del_primer_segmento_del_geolabel(self):
        crudo = dict(LISTING, geoLabel="Malvin norte, Malvin norte, Montevideo")
        self.assertEqual(modelo.normalizar(crudo)["barrio"], "Malvin norte")

    def test_barrio_vacio_cuando_no_hay_geolabel(self):
        self.assertEqual(modelo.normalizar(LISTING)["barrio"], "")

    def test_foto_de_portada(self):
        self.assertEqual(modelo.normalizar(LISTING)["foto_portada"], "listings/a355f1fe/03e41346")

    def test_sin_fotos_no_revienta(self):
        crudo = dict(LISTING, photos=[])
        self.assertIsNone(modelo.normalizar(crudo)["foto_portada"])

    def test_sin_coordenadas_no_revienta(self):
        crudo = dict(LISTING, location=None)
        p = modelo.normalizar(crudo)
        self.assertIsNone(p["lat"])
        self.assertIsNone(p["lon"])


if __name__ == "__main__":
    unittest.main()
