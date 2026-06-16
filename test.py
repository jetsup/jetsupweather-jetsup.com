import requests
import json

location_name = "Nairobi"

# Geocode search
geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location_name}&count=5&language=en&format=json"

try:
    geo_response = requests.get(geo_url, timeout=5).json()
    results = geo_response.get("results", [])

    if not results:
        print(f"No locations found for '{location_name}'.")
        exit()
    elif len(results) == 1:
        chosen = results[0]
    else:
        print(f"\nMultiple locations found for '{location_name}':")
        for index, item in enumerate(results):
            print(f"[{index + 1}] {item.get('name')} ({item.get('admin1', 'Unknown Region')})")
        
        choice = int(input(f"Enter choice (1-{len(results)}): ")) - 1
        chosen = results[choice] if 0 <= choice < len(results) else results[0]

    lat = chosen["latitude"]
    lon = chosen["longitude"]
    
    # Build the "All Available Data" request URL
    # Grouping variables into current, hourly, and daily tracks
    current_vars = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m"
    hourly_vars = "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,cloud_cover,wind_speed_10m,soil_temperature_0cm,uv_index"
    daily_vars = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,rain_sum,showers_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max"
    
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&"
        f"current={current_vars}&"
        f"hourly={hourly_vars}&"
        f"daily={daily_vars}&"
        f"timezone=auto"
    )
    
    print("\nFetching full meteorological payload...")
    weather_data = requests.get(weather_url, timeout=5).json()
    
    # Cleanly parse out the highlights to your console
    current = weather_data.get("current", {})
    daily = weather_data.get("daily", {})
    
    print(f"\n================ WEATHER PROFILE: {chosen.get('name')} ================")
    print(f"Coordinates: {lat}, {lon} | Timezone: {weather_data.get('timezone')}")
    print(f"Elevation: {weather_data.get('elevation')} meters above sea level")
    print("-" * 55)
    print(f"  [Current Temperature]    : {current.get('temperature_2m')}°C (Feels like: {current.get('apparent_temperature')}°C)")
    print(f"  [Relative Humidity]      : {current.get('relative_humidity_2m')}%")
    print(f"  [Atmospheric Pressure]   : {current.get('pressure_msl')} hPa (Sea Level)")
    print(f"  [Wind Configuration]     : {current.get('wind_speed_10m')} km/h at {current.get('wind_direction_10m')}°")
    print(f"  [Cloud Cover Fraction]   : {current.get('cloud_cover')}%")
    print(f"  [Daylight State]         : {'Daylight' if current.get('is_day') == 1 else 'Nighttime'}")
    print("-" * 55)
    print(f"  [Today's Bounds]         : Max: {daily.get('temperature_2m_max')[0]}°C | Min: {daily.get('temperature_2m_min')[0]}°C")
    print(f"  [Solar Window]           : Sunrise: {daily.get('sunrise')[0].split('T')[1]} | Sunset: {daily.get('sunset')[0].split('T')[1]}")
    print(f"  [Max UV Index Today]     : {daily.get('uv_index_max')[0]}")
    print(f"  [Precipitation Outlook]  : {daily.get('precipitation_sum')[0]} mm (Prob: {daily.get('precipitation_probability_max')[0]}%)")
    print("========================================================\n")
    
    # Save the full raw JSON dump to a local file to inspect arrays
    with open("raw_weather_payload.json", "w") as f:
        json.dump(weather_data, f, indent=2)
    print("Saved complete raw 7-day hourly/daily data arrays to 'raw_weather_payload.json'")

except requests.exceptions.Timeout:
    print("Error: The network request timed out.")
except Exception as e:
    print(f"An error occurred: {e}")
