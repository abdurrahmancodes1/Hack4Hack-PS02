import React from "react";
import { Link } from "react-router-dom";

const HomePage = () => {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navbar */}
      <header className="border-b border-slate-100">
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xl">
              H
            </div>
            <span className="text-xl font-bold tracking-tight">Hack4Hack</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#about" className="hover:text-blue-600">
              About
            </a>
            <a href="#features" className="hover:text-blue-600">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-blue-600">
              How it works
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-semibold text-slate-700 hover:text-blue-600"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main>
        <section className="max-w-7xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-xs font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              HACK4HACK 2026
            </span>

            <h1 className="mt-8 text-5xl md:text-7xl font-bold tracking-tight leading-tight">
              Your project.
              <span className="block text-blue-600">Your moment.</span>
            </h1>

            <p className="mt-7 text-lg md:text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto">
              One place to submit your hackathon project, upload your files
              securely, and track your submission from start to finish.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
              <Link
                to="/register"
                className="px-8 py-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-lg shadow-blue-600/20"
              >
                Get Started →
              </Link>

              <Link
                to="/login"
                className="px-8 py-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 font-semibold transition"
              >
                Login to your account
              </Link>
            </div>

            <p className="mt-6 text-sm text-slate-400">
              Simple submissions. Secure uploads. Clear updates.
            </p>
          </div>
        </section>

        {/* About */}
        <section id="about" className="bg-slate-50 border-y border-slate-100">
          <div className="max-w-5xl mx-auto px-6 py-20 text-center">
            <span className="text-blue-600 text-sm font-bold tracking-widest">
              ABOUT THE PLATFORM
            </span>

            <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
              Focus on building. We'll handle the submission.
            </h2>

            <p className="mt-6 text-slate-500 leading-8 max-w-3xl mx-auto">
              Submitting a hackathon project should be straightforward. Our
              platform helps participants upload their work, manage project
              versions, and receive validation updates without worrying about
              complicated submission processes.
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <span className="text-blue-600 text-sm font-bold tracking-widest">
              FEATURES
            </span>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold">
              Everything in one place.
            </h2>
            <p className="mt-4 text-slate-500">
              A simpler way to manage your hackathon submissions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-7">
            <Feature
              icon="↑"
              title="Secure File Uploads"
              description="Upload project files directly to cloud storage with resumable uploads and secure access."
            />

            <Feature
              icon="◷"
              title="Live Status Updates"
              description="Track your submission through uploading, checking, and final validation."
            />

            <Feature
              icon="↻"
              title="Version Management"
              description="Maintain submission history and keep track of every project update."
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-slate-50 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-14">
              <span className="text-blue-600 text-sm font-bold tracking-widest">
                HOW IT WORKS
              </span>
              <h2 className="mt-4 text-3xl md:text-4xl font-bold">
                Three simple steps.
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-10">
              <Step
                number="01"
                title="Create an account"
                description="Register and access your hackathon workspace."
              />

              <Step
                number="02"
                title="Submit your project"
                description="Add project details, links, and upload your files."
              />

              <Step
                number="03"
                title="Track progress"
                description="Get updates and monitor your submission status."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-6 py-24">
          <div className="bg-blue-600 rounded-3xl px-8 py-16 md:py-20 text-center text-white">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
              Ready to submit your project?
            </h2>

            <p className="mt-5 text-blue-100 text-lg">
              Get started and make your work count.
            </p>

            <Link
              to="/register"
              className="inline-block mt-9 px-8 py-4 bg-white text-blue-700 hover:bg-blue-50 rounded-lg font-bold transition"
            >
              Create Your Account →
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <Link to="/" className="font-bold text-xl">
            Hack4Hack
          </Link>

          <p className="text-sm text-slate-400">
            © 2026 Hack4Hack. All rights reserved.
          </p>

          <div className="flex gap-6 text-sm text-slate-500">
            <a href="#about" className="hover:text-blue-600">
              About
            </a>
            <a href="#features" className="hover:text-blue-600">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

const Feature = ({ icon, title, description }) => (
  <div className="p-8 border border-slate-200 rounded-2xl bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition">
    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold">
      {icon}
    </div>

    <h3 className="mt-6 text-xl font-bold">{title}</h3>

    <p className="mt-3 text-slate-500 leading-7 text-sm">{description}</p>
  </div>
);

const Step = ({ number, title, description }) => (
  <div className="text-center">
    <span className="text-5xl font-bold text-blue-200">{number}</span>
    <h3 className="mt-5 text-xl font-bold">{title}</h3>
    <p className="mt-3 text-slate-500 leading-7">{description}</p>
  </div>
);

export default HomePage;
