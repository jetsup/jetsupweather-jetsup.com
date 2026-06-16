/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

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

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Jetsup Weather');
        this._extension = extension;
        this._settings = extension.getSettings();

        this._icon = new St.Icon({
            icon_name: 'weather-clouds-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: '---',
            style_class: 'weather-label',
        });
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this._items = [];
    }

    setWeather(allData) {
        this.menu.removeAll();

        if (allData.length === 0) {
            this._icon.icon_name = 'weather-clouds-symbolic';
            this._label.text = '---';
            const item = new PopupMenu.PopupMenuItem('No locations configured');
            item.setSensitive(false);
            this.menu.addMenuItem(item);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const prefBtn = new PopupMenu.PopupMenuItem('Configure locations\u2026');
            prefBtn.connect('activate', () => Util.spawn(['gnome-extensions', 'prefs', this._extension.uuid]));
            this.menu.addMenuItem(prefBtn);
            return;
        }

        const first = allData[0];
        const c = first.current;
        if (c) {
            this._icon.icon_name = weatherIcon(c.weather_code, c.is_day);
            this._label.text = formatTemp(c.temperature_2m, this._settings.get_string('temperature-unit'));
        }

        for (const loc of allData) {
            const item = this._makeLocationItem(loc);
            this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const prefBtn = new PopupMenu.PopupMenuItem('Configure locations\u2026');
        prefBtn.connect('activate', () => Util.spawn(['gnome-extensions', 'prefs', this._extension.uuid]));
        this.menu.addMenuItem(prefBtn);
    }

    _makeLocationItem(loc) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const c = loc.current;
        const d = loc.daily;

        const icon = new St.Icon({
            icon_name: weatherIcon(c?.weather_code ?? 0, c?.is_day ?? 1),
            style_class: 'system-status-icon',
        });

        const textBox = new St.BoxLayout({vertical: true});
        const nameLabel = new St.Label({
            text: loc.label || loc.query || 'Unknown',
            style_class: 'weather-location-name',
        });
        textBox.add_child(nameLabel);

        if (c) {
            const unit = this._settings.get_string('temperature-unit');
            const windUnit = this._settings.get_string('wind-speed-unit');
            const temp = formatTemp(c.temperature_2m, unit);
            const feels = formatTemp(c.apparent_temperature, unit);
            const condition = weatherText(c.weather_code);
            const wind = formatWind(c.wind_speed_10m, windUnit);
            const humidity = `${c.relative_humidity_2m}%`;

            const line1 = new St.Label({
                text: `${temp}  ${condition}`,
                style_class: 'weather-line',
            });
            textBox.add_child(line1);

            const line2 = new St.Label({
                text: `Feels ${feels}  \u2726${humidity}  \u27a2${wind}`,
                style_class: 'weather-detail',
            });
            textBox.add_child(line2);
        }

        item.add_child(icon);
        item.add_child(textBox);
        return item;
    }
});

export default class JetsupWeatherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
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
        const intervalMin = Math.max(5, this._settings.get_int('refresh-interval'));
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, intervalMin * 60, () => {
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

            const results = await Promise.allSettled(
                locations.map(loc => this._fetchWeather(loc, unit, windUnit, forecastDays))
            );

            const allData = [];
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.status === 'fulfilled' && r.value) {
                    r.value.label = locations[i].name || null;
                    r.value.query = locations[i].query || null;
                    allData.push(r.value);
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
