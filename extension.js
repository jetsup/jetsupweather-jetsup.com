import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const WMO_CODES = {
    0:  {icon: 'weather-clear-symbolic',        text: 'Clear'},
    1:  {icon: 'weather-few-clouds-symbolic',    text: 'Mainly clear'},
    2:  {icon: 'weather-cloudy-symbolic',        text: 'Partly cloudy'},
    3:  {icon: 'weather-overcast-symbolic',      text: 'Overcast'},
    45: {icon: 'weather-fog-symbolic',           text: 'Foggy'},
    48: {icon: 'weather-fog-symbolic',           text: 'Depositing rime fog'},
    51: {icon: 'weather-showers-symbolic',       text: 'Light drizzle'},
    53: {icon: 'weather-showers-symbolic',       text: 'Moderate drizzle'},
    55: {icon: 'weather-showers-symbolic',       text: 'Dense drizzle'},
    56: {icon: 'weather-freezing-rain-symbolic', text: 'Light freezing drizzle'},
    57: {icon: 'weather-freezing-rain-symbolic', text: 'Dense freezing drizzle'},
    61: {icon: 'weather-rain-symbolic',          text: 'Slight rain'},
    63: {icon: 'weather-rain-symbolic',          text: 'Moderate rain'},
    65: {icon: 'weather-rain-symbolic',          text: 'Heavy rain'},
    66: {icon: 'weather-freezing-rain-symbolic', text: 'Light freezing rain'},
    67: {icon: 'weather-freezing-rain-symbolic', text: 'Heavy freezing rain'},
    71: {icon: 'weather-snow-symbolic',          text: 'Slight snow'},
    73: {icon: 'weather-snow-symbolic',          text: 'Moderate snow'},
    75: {icon: 'weather-snow-symbolic',          text: 'Heavy snow'},
    77: {icon: 'weather-snow-symbolic',          text: 'Snow grains'},
    80: {icon: 'weather-showers-symbolic',       text: 'Slight rain showers'},
    81: {icon: 'weather-showers-symbolic',       text: 'Moderate rain showers'},
    82: {icon: 'weather-showers-symbolic',       text: 'Violent rain showers'},
    85: {icon: 'weather-snow-symbolic',          text: 'Slight snow showers'},
    86: {icon: 'weather-snow-symbolic',          text: 'Heavy snow showers'},
    95: {icon: 'weather-storm-symbolic',         text: 'Thunderstorm'},
    96: {icon: 'weather-storm-symbolic',         text: 'Thunderstorm with slight hail'},
    99: {icon: 'weather-storm-symbolic',         text: 'Thunderstorm with heavy hail'},
};

const NIGHT_ICONS = {
    'weather-clear-symbolic': 'weather-clear-night-symbolic',
    'weather-few-clouds-symbolic': 'weather-few-clouds-night-symbolic',
};

function weatherIcon(code, isDay) {
    const entry = WMO_CODES[code] || WMO_CODES[0];
    const icon = entry.icon;
    if (!isDay && NIGHT_ICONS[icon])
        return NIGHT_ICONS[icon];
    return icon;
}

function weatherText(code) {
    return (WMO_CODES[code] || WMO_CODES[0]).text;
}

function formatTemp(celsius, unit) {
    if (unit === 'fahrenheit') {
        const f = Math.round(celsius * 9 / 5 + 32);
        return `${f}°F`;
    }
    return `${Math.round(celsius)}°C`;
}

function formatWind(kmh, unit) {
    const conversions = {'km/h': v => v, 'mph': v => v * 0.621371, 'm/s': v => v / 3.6, 'knots': v => v * 0.539957};
    const fn = conversions[unit] || (v => v);
    return `${Math.round(fn(kmh) * 10) / 10} ${unit}`;
}

function dayName(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[d.getDay()];
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Jetsup Weather');
        this._extension = extension;

        this._icon = new St.Icon({
            icon_name: 'weather-clouds-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._menuItems = [];
        this._built = false;
    }

    setWeather(allData) {
        if (allData.length > 0 && allData[0].current)
            this._icon.icon_name = weatherIcon(allData[0].current.weather_code, allData[0].current.is_day);

        if (allData.length === 0)
            return this._rebuild(allData);

        if (!this._built) {
            this._rebuild(allData);
            this._built = true;
            return;
        }

        const max = Math.max(this._menuItems.length, allData.length);
        for (let i = 0; i < max; i++) {
            if (i >= allData.length) {
                while (this._menuItems.length > i) {
                    const e = this._menuItems.pop();
                    this.menu.remove_child(e.item);
                }
                break;
            }
            if (i >= this._menuItems.length) {
                const e = this._createEntry(allData[i]);
                this._menuItems.push(e);
                this.menu.addMenuItem(e.item, i);
            } else {
                this._updateEntry(this._menuItems[i], allData[i]);
            }
        }
    }

    _rebuild(allData) {
        this.menu.removeAll();
        this._menuItems = [];

        if (allData.length === 0) {
            this._icon.icon_name = 'weather-clouds-symbolic';
            const item = new PopupMenu.PopupMenuItem('No locations configured');
            item.setSensitive(false);
            this.menu.addMenuItem(item);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const btn = new PopupMenu.PopupMenuItem('Configure locations\u2026');
            btn.connect('activate', () => Util.spawn(['gnome-extensions', 'prefs', this._extension.uuid]));
            this.menu.addMenuItem(btn);
            return;
        }

        for (const loc of allData) {
            const e = this._createEntry(loc);
            this._menuItems.push(e);
            this.menu.addMenuItem(e.item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const rBtn = new PopupMenu.PopupMenuItem('Refresh now');
        rBtn.connect('activate', () => this._extension._refresh());
        this.menu.addMenuItem(rBtn);
        const pBtn = new PopupMenu.PopupMenuItem('Configure locations\u2026');
        pBtn.connect('activate', () => Util.spawn(['gnome-extensions', 'prefs', this._extension.uuid]));
        this.menu.addMenuItem(pBtn);
    }

    _createEntry(loc) {
        const item = new PopupMenu.PopupSubMenuMenuItem(loc.label || loc.query || 'Unknown');
        const icon = new St.Icon({
            icon_name: 'weather-clouds-symbolic',
            style_class: 'system-status-icon',
        });
        item.actor.insert_child_at_index(icon, 0);
        const entry = {item, icon, detailBox: null, forecastBox: null};
        this._updateEntry(entry, loc);
        return entry;
    }

    _updateEntry(entry, loc) {
        const item = entry.item;
        const icon = entry.icon;
        const unit = this._extension._settings.get_string('temperature-unit');

        if (loc.fetching) {
            item.label.text = `${loc.label || loc.query || 'Unknown'}  Fetching\u2026`;
            icon.icon_name = 'weather-clouds-symbolic';
        } else {
            const c = loc.current;
            item.label.text = `${loc.label || loc.query || 'Unknown'}  ${c ? formatTemp(c.temperature_2m, unit) : ''}`;
            icon.icon_name = weatherIcon(c?.weather_code ?? 0, c?.is_day ?? 1);
        }

        if (!entry.detailBox) {
            item.menu.removeAll();
            item.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const dItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
            entry.detailBox = new St.BoxLayout({vertical: true});
            dItem.add_child(entry.detailBox);
            item.menu.addMenuItem(dItem);
        }

        if (!loc.fetching && loc.daily && loc.daily.time && !entry.forecastBox) {
            item.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const fItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
            const sv = new St.ScrollView({
                hscrollbar_policy: 0,
                vscrollbar_policy: 2,
                clip_to_allocation: true,
            });
            entry.forecastBox = new St.BoxLayout({style_class: 'weather-forecast-box'});
            sv.child = entry.forecastBox;
            fItem.add_child(sv);
            item.menu.addMenuItem(fItem);
        }

        let child = entry.detailBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            entry.detailBox.remove_child(child);
            child = next;
        }

        if (loc.fetching) {
            entry.detailBox.add_child(new St.Label({text: 'Fetching weather data\u2026'}));
            return;
        }

        const c = loc.current;
        const d = loc.daily;

        if (c) {
            const windUnit = this._extension._settings.get_string('wind-speed-unit');
            const feels = formatTemp(c.apparent_temperature, unit);
            const wind = formatWind(c.wind_speed_10m, windUnit);
            const cond = weatherText(c.weather_code);

            const lines = [
                cond,
                `Temperature: ${formatTemp(c.temperature_2m, unit)} (feels like ${feels})`,
                `Humidity: ${c.relative_humidity_2m}%`,
                `Wind: ${wind}`,
                `Cloud cover: ${c.cloud_cover}%`,
                `Pressure: ${c.pressure_msl} hPa`,
            ];
            if (c.precipitation > 0)
                lines.push(`Precipitation: ${c.precipitation} mm`);

            for (const line of lines)
                entry.detailBox.add_child(new St.Label({text: line, style_class: 'weather-detail'}));
        }

        if (entry.forecastBox && d && d.time) {
            let fc = entry.forecastBox.get_first_child();
            while (fc) {
                const next = fc.get_next_sibling();
                entry.forecastBox.remove_child(fc);
                fc = next;
            }

            for (let i = 0; i < d.time.length; i++) {
                const hi = formatTemp(d.temperature_2m_max[i], unit);
                const lo = formatTemp(d.temperature_2m_min[i], unit);
                const code = d.weather_code[i];
                const prob = d.precipitation_probability_max[i] ?? 0;

                const card = new St.BoxLayout({vertical: true, style_class: 'weather-forecast-card'});
                card.add_child(new St.Label({text: dayName(d.time[i]), style_class: 'weather-detail'}));
                card.add_child(new St.Icon({
                    icon_name: weatherIcon(code, 1),
                    style_class: 'weather-forecast-icon',
                    icon_size: 24,
                }));
                card.add_child(new St.Label({text: `${hi} / ${lo}`, style_class: 'weather-forecast-temp'}));
                if (prob > 0)
                    card.add_child(new St.Label({text: `\u2602${prob}%`, style_class: 'weather-detail'}));
                entry.forecastBox.add_child(card);
            }
        }
    }
});

export default class JetsupWeatherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._weatherCache = {};
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._refresh();
        });

        this._refresh();
        this._startTimer();
    }

    disable() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }

    _startTimer() {
        const interval = Math.max(10, this._settings.get_int('refresh-interval'));
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _refresh() {
        if (this._refreshing)
            return;
        this._refreshing = true;

        try {
            const locations = JSON.parse(this._settings.get_string('locations') || '[]');

            if (locations.length === 0) {
                this._indicator.setWeather([]);
                return;
            }

            const unit = this._settings.get_string('temperature-unit');
            const windUnit = this._settings.get_string('wind-speed-unit');
            const forecastDays = this._settings.get_int('forecast-days');
            const now = Date.now() / 1000;

            const results = await Promise.allSettled(
                locations.map(loc => this._fetchWeather(loc, unit, windUnit, forecastDays))
            );

            const allData = [];
            for (let i = 0; i < results.length; i++) {
                const key = `${locations[i].latitude},${locations[i].longitude}`;
                const r = results[i];
                if (r.status === 'fulfilled' && r.value) {
                    const data = {
                        label: locations[i].name || null,
                        query: locations[i].query || null,
                        current: r.value.current,
                        daily: r.value.daily,
                    };
                    this._weatherCache[key] = {data, timestamp: now};
                    allData.push(data);
                } else {
                    const cached = this._weatherCache[key];
                    if (cached && (now - cached.timestamp) < 3600) {
                        allData.push({
                            ...cached.data,
                            label: locations[i].name || null,
                            query: locations[i].query || null,
                        });
                    } else {
                        allData.push({
                            label: locations[i].name || null,
                            query: locations[i].query || null,
                            current: null,
                            daily: null,
                            fetching: true,
                        });
                    }
                }
            }

            this._indicator.setWeather(allData);
        } catch (e) {
            console.log(`[JetsupWeather] ${e}`);
        } finally {
            this._refreshing = false;
        }
    }

    _fetchWeather(location, unit, windUnit, forecastDays) {
        const windApiMap = {'km/h': 'kmh', 'mph': 'mph', 'm/s': 'ms', 'knots': 'kn'};
        return new Promise((resolve, reject) => {
            let url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}`;
            url += '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m';
            url += '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';
            url += '&timezone=auto';
            url += `&wind_speed_unit=${windApiMap[windUnit] || 'kmh'}`;
            url += `&forecast_days=${forecastDays}`;
            if (unit === 'fahrenheit')
                url += '&temperature_unit=fahrenheit';

            const msg = Soup.Message.new('GET', url);
            const session = new Soup.Session({timeout: 10});

            session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                try {
                    const bytes = s.send_and_read_finish(res);
                    if (msg.get_status() !== 200) {
                        reject(new Error(`HTTP ${msg.get_status()}`));
                        return;
                    }
                    const json = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                    resolve({current: json.current, daily: json.daily});
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}
