import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
	{ code: 'en', label: 'English' },
	{ code: 'de', label: 'Deutsch' },
	// { code: 'fr', label: 'Français' }
];

export default function Menu({ onLogout }) {
	const [open, setOpen] = useState(false);
	const menuRef = useRef(null);
	const { i18n, t } = useTranslation();

	const changeLang = (lng) => {
		i18n.changeLanguage(lng);
		localStorage.setItem('lang', lng);
		setOpen(false);
	};

	// close dropdown on outside click
	useEffect(() => {
		const clickOutside = (e) => {
			if (menuRef.current && !menuRef.current.contains(e.target)) {
				setOpen(false);
			}
		};
		window.addEventListener('click', clickOutside);
		return () => window.removeEventListener('click', clickOutside);
	}, []);

	return (
		// outer absolute for top-right
		<div className="absolute top-3 right-3">
			{/* inner relative container */}
			<div className="relative" ref={menuRef}>
				{/* Menu button */}
				<button
					onClick={() => setOpen((o) => !o)}
					className="border border-charcoal text-charcoal bg-parchment hover:bg-parchment rounded-full px-4 py-4 shadow-sm"
					aria-label={t('settings')}
				>
					<svg
						className="w-8 h-8"
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="22"
						height="22"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
						/>
						<path
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
						/>
					</svg>
				</button>

				{open && (
					<div className="absolute right-0 top-full mt-2 w-48 bg-parchment border border-charcoal rounded-md shadow-lg z-50">
						<div className="flex flex-col">
							{LANGUAGES.map(({ code, label }) => (
								<button
									key={code}
									onClick={() => changeLang(code)}
									className={
										`w-full text-left px-4 py-2 hover:bg-parchment focus:outline-none ` +
										(i18n.language === code ? 'font-bold' : '')
									}
								>
									{label}
								</button>
							))}
						</div>
						<div className="border-t border-charcoal" />
						<button
							onClick={onLogout}
							className="w-full text-left px-4 py-2 text-charcoal hover:bg-parchment"
						>
							{t('logout')}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
